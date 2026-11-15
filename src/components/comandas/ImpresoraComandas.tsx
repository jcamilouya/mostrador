'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { comandasSinImprimir, tomarParaImprimir } from '@/lib/comandas/actions';
import { imprimirHTML, ticketComanda } from '@/lib/comandas/ticket';

const CLAVE = 'mostrador.imprimeComandas';
const EVENTO = 'mostrador:impresora';

/** ¿Este equipo es la impresora de cocina? Vive en ESTE navegador. */
export function esImpresora(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function ponerImpresora(v: boolean) {
  try {
    if (v) localStorage.setItem(CLAVE, '1');
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: no se puede marcar este equipo */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Para mostrar el interruptor con el valor real de este equipo. */
export function useEsImpresora(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const leer = () => setV(esImpresora());
    leer();
    window.addEventListener(EVENTO, leer);
    window.addEventListener('storage', leer);
    return () => {
      window.removeEventListener(EVENTO, leer);
      window.removeEventListener('storage', leer);
    };
  }, []);
  return v;
}

/**
 * Va en el layout del dashboard. Si este equipo está marcado como impresora
 * de cocina, escucha las comandas nuevas (Realtime) y las imprime. Cada una se
 * "toma" en el servidor antes de imprimir, así nunca sale dos veces aunque
 * haya dos equipos marcados. Al prender (o volver el internet) imprime lo que
 * quedó pendiente de la última media hora.
 */
export function ImpresoraComandas({ empresaId }: { empresaId: string }) {
  const activa = useEsImpresora();

  useEffect(() => {
    if (!activa) return;
    const supabase = createClient();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cola: Promise<void> = Promise.resolve();

    const imprimir = (id: string) => {
      // En fila: dos comandas seguidas no se pisan en el diálogo de impresión.
      cola = cola.then(async () => {
        const c = await tomarParaImprimir(id).catch(() => null);
        if (!c || cancelado) return;
        if (!imprimirHTML(ticketComanda(c))) {
          toast.error(`No se pudo imprimir la comanda #${c.numero}. Reimprímela desde Cocina.`);
        }
        await new Promise((r) => setTimeout(r, 1200));
      });
    };

    const pendientes = async () => {
      const ids = await comandasSinImprimir().catch(() => []);
      ids.forEach(imprimir);
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelado) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      canal = supabase
        .channel(`mostrador-impresora-${empresaId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'comandas', filter: `empresa_id=eq.${empresaId}` },
          (p) => imprimir((p.new as { id: string }).id),
        )
        .subscribe();
      await pendientes();
    })();

    window.addEventListener('online', pendientes);
    return () => {
      cancelado = true;
      window.removeEventListener('online', pendientes);
      if (canal) supabase.removeChannel(canal);
    };
  }, [activa, empresaId]);

  return null;
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Escucha cambios en ventas y egresos de la empresa vía Supabase Realtime y
 * refresca los Server Components de la ruta actual (KPIs, gráfico, analítica).
 * Hace debounce para no refrescar en ráfaga cuando llegan varios eventos juntos.
 */
export function RealtimeRefresher({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const refrescar = () => {
      // El POS se actualiza solo al terminar una venta, y refrescarlo en medio
      // de un cobro es peor que no refrescarlo: se marca como pendiente y se
      // aplica cuando el usuario salga de ahí.
      if (pathname.startsWith('/dashboard/pos')) {
        pendiente.current = true;
        return;
      }
      // Con la pestaña de fondo no hay nada que mirar: se aplaza.
      if (typeof document !== 'undefined' && document.hidden) {
        pendiente.current = true;
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      // Debounce largo: en hora pico entran varias ventas seguidas y cada
      // refresh vuelve a correr todas las consultas de la pantalla.
      timer.current = setTimeout(() => {
        pendiente.current = false;
        router.refresh();
      }, 1500);
    };

    // Al volver a la pestaña, ponerse al día una sola vez.
    const alVolver = () => {
      if (!document.hidden && pendiente.current) {
        pendiente.current = false;
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', alVolver);

    const filtro = `empresa_id=eq.${empresaId}`;
    const channel = supabase
      .channel(`mostrador-${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas', filter: filtro }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos', filter: filtro }, refrescar)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', alVolver);
      supabase.removeChannel(channel);
    };
  }, [empresaId, router, pathname]);

  return null;
}

'use client';

import { useEffect, useState } from 'react';
import { ChefHat, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Comanda } from '@/lib/comandas/queries';
import { imprimirHTML, ticketComanda } from '@/lib/comandas/ticket';
import { ponerImpresora, useEsImpresora } from './ImpresoraComandas';

function hace(iso: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/**
 * Lo que se ha mandado a cocina en el turno, la más nueva arriba. Sirve de
 * pantalla en la cocina (sin impresora) y para reimprimir. Aquí se marca el
 * equipo que imprime las comandas.
 */
export function CocinaVista({ comandas, generadoEn }: { comandas: Comanda[]; generadoEn: number }) {
  const impresora = useEsImpresora();
  const [ahora, setAhora] = useState(generadoEn);

  useEffect(() => {
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-foreground"
          checked={impresora}
          onChange={(e) => ponerImpresora(e.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Printer className="h-4 w-4" /> Este equipo imprime las comandas
          </span>
          <span className="text-sm text-muted-foreground">
            Actívalo en el computador que tiene la impresora de cocina. Cada vez que alguien marche
            un pedido, aquí sale la comanda. Déjalo con Mostrador abierto.
          </span>
        </span>
      </label>

      {comandas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-14 text-center shadow-sm">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary">
            <ChefHat className="h-7 w-7 text-muted-foreground" />
          </span>
          <p className="font-semibold">Todavía no ha llegado nada a cocina</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Cuando un mesero toque <strong>Marchar</strong> en una mesa, la comanda aparece aquí.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {comandas.map((c) => {
            const anulado = c.tipo === 'anulado';
            return (
              <li
                key={c.id}
                className={`flex flex-col rounded-2xl bg-card p-4 shadow-sm ${
                  anulado ? 'ring-2 ring-[var(--egreso)]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      #{c.numero} · {hace(c.created_at, ahora)}
                      {c.creado_por ? ` · ${c.creado_por}` : ''}
                    </p>
                    <p className="truncate text-lg font-semibold">{c.titulo}</p>
                    {c.detalle && <p className="text-xs text-muted-foreground">{c.detalle}</p>}
                  </div>
                  {anulado && (
                    <span className="shrink-0 rounded-lg bg-[var(--egreso)] px-2 py-1 text-xs font-bold tracking-wide text-white">
                      ANULADO
                    </span>
                  )}
                </div>
                <ul className={`mt-3 flex-1 space-y-1 font-mono text-sm ${anulado ? 'line-through opacity-70' : ''}`}>
                  {c.items.map((i, idx) => (
                    <li key={idx}>
                      <span className="font-bold">{i.cantidad}×</span> {i.nombre}
                      {i.nota && <span className="block pl-6 text-[var(--utilidad)]">→ {i.nota}</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{c.impresa_en ? 'Impresa' : 'Sin imprimir'}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5"
                    onClick={() => imprimirHTML(ticketComanda(c))}
                  >
                    <Printer className="h-3.5 w-3.5" /> Reimprimir
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

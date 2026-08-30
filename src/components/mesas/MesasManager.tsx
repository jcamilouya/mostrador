'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, Clock, Plus, Trash2, Loader2, Receipt } from 'lucide-react';
import { anularCuenta } from '@/lib/mesas/actions';
import type { CuentaAbierta } from '@/lib/mesas/queries';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';

/** Minutos que lleva abierta la cuenta. */
function minutosAbierta(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function textoTiempo(min: number): string {
  if (min < 1) return 'recién abierta';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto > 0 ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * Color por tiempo: verde recién sentados, ámbar ya llevan rato, rojo llevan
 * demasiado. De un vistazo el dueño ve a qué mesa hay que ir.
 */
function colorTiempo(min: number): { texto: string; punto: string; borde: string } {
  if (min < 20) {
    return {
      texto: 'text-[var(--ingreso)]',
      punto: 'bg-[var(--ingreso)]',
      borde: 'var(--ingreso)',
    };
  }
  if (min < 60) {
    return {
      texto: 'text-[var(--utilidad)]',
      punto: 'bg-[var(--utilidad)]',
      borde: 'var(--utilidad)',
    };
  }
  return { texto: 'text-[var(--egreso)]', punto: 'bg-[var(--egreso)]', borde: 'var(--egreso)' };
}

export function MesasManager({ cuentas }: { cuentas: CuentaAbierta[] }) {
  const router = useRouter();
  const cargarCuenta = useCart((s) => s.cargarCuenta);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Lleva la cuenta al POS para seguirle agregando o cobrarla. */
  function abrir(cuenta: CuentaAbierta) {
    cargarCuenta({
      id: cuenta.id,
      mesa: cuenta.mesa,
      cliente: cuenta.cliente,
      items: cuenta.items
        .filter((i) => i.producto_id)
        .map((i) => ({
          lineId: `${i.producto_id}::${i.nombre_producto}`,
          producto_id: i.producto_id as string,
          nombre: i.nombre_producto,
          variante: null,
          insumo_extra_id: i.insumo_extra_id,
          precio_venta: i.precio_unitario,
          precio_compra: i.precio_compra,
          cantidad: i.cantidad,
          // La cuenta ya existe: no volvemos a topar por stock al retomarla.
          stock_disponible: Number.POSITIVE_INFINITY,
        })),
    });
    router.push('/dashboard/pos');
  }

  function anular(cuenta: CuentaAbierta) {
    if (!confirm(`¿Anular la cuenta de "${cuenta.mesa}"? No se cobrará nada.`)) return;
    setAnulando(cuenta.id);
    startTransition(async () => {
      const res = await anularCuenta(cuenta.id);
      setAnulando(null);
      if (res.ok) {
        toast.success(`Cuenta de "${cuenta.mesa}" anulada`);
        router.refresh();
      } else {
        toast('No se pudo anular', { description: res.error });
      }
    });
  }

  const totalAbierto = cuentas.reduce((acc, c) => acc + c.total, 0);
  const platos = cuentas.reduce(
    (acc, c) => acc + c.items.reduce((a, i) => a + i.cantidad, 0),
    0,
  );

  if (cuentas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-3xl bg-card px-6 py-14 text-center shadow-sm">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
          <UtensilsCrossed className="h-9 w-9 text-muted-foreground" />
        </span>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold">No hay mesas abiertas</p>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            Arma el pedido en Vender y toca <strong>Guardar en mesa</strong>. Aquí lo ves
            crecer y lo cobras cuando el cliente pida la cuenta.
          </p>
        </div>
        <Link href="/dashboard/pos">
          <Button size="lg" className="h-12 rounded-2xl gap-2">
            <Plus className="h-4 w-4" /> Abrir una mesa
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen del salón */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Mesas abiertas</p>
          <p className="text-2xl font-semibold tabular-nums">{cuentas.length}</p>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Platos servidos</p>
          <p className="text-2xl font-semibold tabular-nums">{platos}</p>
        </div>
        <div className="rounded-3xl bg-[var(--utilidad)]/10 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Sin cobrar</p>
          <p className="text-2xl font-semibold tabular-nums text-[var(--utilidad)]">
            {formatCOP(totalAbierto)}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/dashboard/pos">
          <Button className="h-11 rounded-2xl gap-2">
            <Plus className="h-4 w-4" /> Abrir otra mesa
          </Button>
        </Link>
      </div>

      {/* El salón */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cuentas.map((c) => {
          const min = minutosAbierta(c.abiertaDesde);
          const color = colorTiempo(min);
          const unidades = c.items.reduce((a, i) => a + i.cantidad, 0);
          const ocupada = anulando === c.id;

          return (
            <div
              key={c.id}
              className="group relative flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm transition-transform hover:scale-[1.01]"
              style={{ borderTop: `4px solid ${color.borde}` }}
            >
              <button
                type="button"
                onClick={() => abrir(c)}
                disabled={ocupada}
                className="flex flex-1 flex-col gap-3 p-5 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words text-xl font-semibold leading-tight">
                    {c.mesa}
                  </p>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    #{c.numero_venta}
                  </span>
                </div>

                <p className="text-3xl font-bold tabular-nums">{formatCOP(c.total)}</p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className={`inline-flex items-center gap-1.5 font-medium ${color.texto}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${color.punto}`} />
                    <Clock className="h-3 w-3" />
                    {textoTiempo(min)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Receipt className="h-3 w-3" />
                    {unidades} {unidades === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>

                <ul className="mt-auto space-y-0.5 text-xs text-muted-foreground">
                  {c.items.slice(0, 3).map((i, idx) => (
                    <li key={idx} className="truncate">
                      {i.cantidad}× {i.nombre_producto}
                    </li>
                  ))}
                  {c.items.length > 3 && <li>y {c.items.length - 3} más…</li>}
                </ul>
              </button>

              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                <span className="flex-1 text-center text-sm font-medium text-muted-foreground">
                  Toca para cobrar o agregar
                </span>
                <button
                  type="button"
                  onClick={() => anular(c)}
                  disabled={ocupada}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-[var(--egreso)]"
                  aria-label={`Anular cuenta de ${c.mesa}`}
                >
                  {ocupada ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, Clock, Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { anularCuenta } from '@/lib/mesas/actions';
import type { CuentaAbierta } from '@/lib/mesas/queries';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';

/** "hace 25 min", "hace 2 h" — lo que un mesero necesita saber de un vistazo. */
function desdeHace(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'recién abierta';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60 > 0 ? `${min % 60} min` : ''}`.trim();
}

export function MesasManager({ cuentas }: { cuentas: CuentaAbierta[] }) {
  const router = useRouter();
  const cargarCuenta = useCart((s) => s.cargarCuenta);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Lleva la cuenta al POS para seguirle agregando o cobrarla. */
  function abrir(cuenta: CuentaAbierta) {
    cargarCuenta({
      id: cuenta.id,
      mesa: cuenta.mesa,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {cuentas.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{cuentas.length}</strong> cuenta
            {cuentas.length === 1 ? '' : 's'} abierta{cuentas.length === 1 ? '' : 's'} ·{' '}
            <strong className="text-foreground tabular-nums">{formatCOP(totalAbierto)}</strong> sin
            cobrar
          </p>
        ) : (
          <span />
        )}
        <Link href="/dashboard/pos">
          <Button className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" /> Abrir una cuenta
          </Button>
        </Link>
      </div>

      {cuentas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-10 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            No tienes cuentas abiertas. En el POS, arma el pedido y toca{' '}
            <strong>Guardar en mesa</strong> para dejarlo abierto y cobrarlo después.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cuentas.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{c.mesa}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {desdeHace(c.abiertaDesde)} · #{c.numero_venta}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-semibold tabular-nums">
                  {formatCOP(c.total)}
                </p>
              </div>

              <ul className="space-y-1 text-sm text-muted-foreground">
                {c.items.slice(0, 4).map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i.cantidad}× {i.nombre_producto}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCOP(i.cantidad * i.precio_unitario)}
                    </span>
                  </li>
                ))}
                {c.items.length > 4 && (
                  <li className="text-xs">y {c.items.length - 4} más…</li>
                )}
              </ul>

              <div className="mt-auto flex gap-2 pt-1">
                <Button onClick={() => abrir(c)} className="flex-1 rounded-2xl gap-1.5">
                  Abrir <ArrowRight className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => anular(c)}
                  disabled={pending && anulando === c.id}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-[var(--egreso)]"
                  aria-label={`Anular cuenta de ${c.mesa}`}
                >
                  {pending && anulando === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Trash2, Plus, Minus, ShoppingBag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import { PaymentModal } from './PaymentModal';
import type { BrebConfig } from '@/lib/breb/queries';

export function Cart({ negocio, breb }: { negocio: string; breb: BrebConfig }) {
  const items = useCart((s) => s.items);
  const setCantidad = useCart((s) => s.setCantidad);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const total = useCart((s) => s.total());
  const totalItems = useCart((s) => s.totalItems());

  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const empty = items.length === 0;

  // Desktop sidebar
  const Body = (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-4">
        <div>
          <p className="text-xs text-muted-foreground">{negocio}</p>
          <h2 className="text-lg font-semibold">Tu venta</h2>
        </div>
        {!empty && (
          <button
            onClick={clear}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Vaciar
          </button>
        )}
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <p>Toca un producto para agregarlo a la venta.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {items.map((i) => (
            <li
              key={i.producto_id}
              className="rounded-xl bg-card p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCOP(i.precio_venta)} c/u
                  </p>
                </div>
                <button
                  onClick={() => remove(i.producto_id)}
                  className="text-muted-foreground hover:text-[var(--egreso)]"
                  aria-label="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCantidad(i.producto_id, i.cantidad - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-8 text-center text-sm font-medium tabular-nums">
                    {i.cantidad}
                  </span>
                  <button
                    onClick={() => setCantidad(i.producto_id, i.cantidad + 1)}
                    disabled={i.cantidad >= i.stock_disponible}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCOP(i.cantidad * i.precio_venta)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t px-4 py-4 space-y-3">
        <div className="flex items-end justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-3xl font-semibold tabular-nums">
            {formatCOP(total)}
          </span>
        </div>
        <Button
          size="lg"
          className="w-full rounded-2xl h-12 text-base"
          disabled={empty}
          onClick={() => setPayOpen(true)}
        >
          Cobrar {!empty && formatCOP(total)}
        </Button>
      </footer>

      <PaymentModal
        open={payOpen}
        breb={breb}
        onClose={() => setPayOpen(false)}
        onSuccess={() => {
          setPayOpen(false);
          setOpen(false);
        }}
      />
    </div>
  );

  return (
    <>
      {/* Desktop sidebar fijo */}
      <aside className="hidden lg:flex lg:w-96 lg:flex-col lg:border-l lg:bg-sidebar">
        {Body}
      </aside>

      {/* Mobile: barra inferior sticky */}
      <div className="fixed bottom-20 left-0 right-0 z-20 px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          disabled={empty}
          className={`flex w-full items-center justify-between rounded-2xl px-5 py-3 shadow-lg transition-all ${
            empty
              ? 'bg-secondary text-muted-foreground'
              : 'bg-foreground text-background'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/20 text-sm font-semibold">
              {totalItems}
            </span>
            <span className="text-sm">Ver venta</span>
          </div>
          <span className="text-lg font-semibold tabular-nums">{formatCOP(total)}</span>
        </button>
      </div>

      {/* Mobile bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 h-[85vh] rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="flex justify-end px-4 pt-3">
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {Body}
          </div>
        </div>
      )}
    </>
  );
}

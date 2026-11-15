'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, Plus, Minus, ShoppingBag, X, UtensilsCrossed, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import { guardarCuenta } from '@/lib/mesas/actions';
import { MesaPicker, type MesaParaElegir } from '@/components/mesas/MesaPicker';
import { PaymentModal } from './PaymentModal';
import { ClienteSearch } from './ClienteSearch';
import type { BrebConfig } from '@/lib/breb/queries';

export function Cart({
  negocio,
  breb,
  practica = false,
  mesasSalon = [],
}: {
  negocio: string;
  breb: BrebConfig;
  /** Modo práctica: la venta se simula y no se guarda. */
  practica?: boolean;
  /** Mesas del plano del salón, para elegir a cuál va el pedido. */
  mesasSalon?: MesaParaElegir[];
}) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const setCantidad = useCart((s) => s.setCantidad);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const total = useCart((s) => s.total());
  const totalItems = useCart((s) => s.totalItems());
  const cuentaId = useCart((s) => s.cuentaId);
  const mesa = useCart((s) => s.mesa);
  const mesaId = useCart((s) => s.mesaId);
  const huella = useCart((s) => s.huella);
  const cliente = useCart((s) => s.cliente);
  const cobrarAlAbrir = useCart((s) => s.cobrarAlAbrir);
  const setCobrarAlAbrir = useCart((s) => s.setCobrarAlAbrir);

  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [mesaPicker, setMesaPicker] = useState(false);
  const [guardando, startGuardar] = useTransition();
  // El cobro empezó desde el plano: al terminar se vuelve a Mesas. Se guarda
  // aparte porque el carrito se vacía en cuanto la venta queda registrada.
  const volverAMesas = useRef(false);

  const empty = items.length === 0;
  const enMesa = Boolean(cuentaId || mesaId);

  // Tocaron "Cobrar" en el plano: el modal de cobro se abre al llegar.
  useEffect(() => {
    if (cobrarAlAbrir && items.length > 0) {
      setCobrarAlAbrir(false);
      abrirCobro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrarAlAbrir, items.length]);

  function abrirCobro() {
    volverAMesas.current = Boolean(cuentaId);
    setPayOpen(true);
  }

  /** Deja el pedido abierto en una mesa en vez de cobrarlo ya. */
  function guardarEnMesa(etiqueta: string, idMesa: string | null = mesaId) {
    if (!etiqueta) return;

    startGuardar(async () => {
      const res = await guardarCuenta({
        venta_id: cuentaId,
        mesa: etiqueta,
        mesa_id: idMesa,
        huella,
        cliente_id: cliente?.id ?? null,
        items: items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          nombre: i.nombre,
          variante: i.variante ?? null,
          insumo_extra_id: i.insumo_extra_id ?? null,
        })),
      });
      if (res.ok) {
        toast.success(`"${etiqueta}" guardada`, {
          description: `${formatCOP(res.total)} sin cobrar. La encuentras en Mesas.`,
        });
        clear();
        setOpen(false);
        setMesaPicker(false);
        // Con plano, el mesero vuelve al salón a atender la siguiente mesa.
        if (idMesa) router.push('/dashboard/mesas');
        else router.refresh();
      } else {
        toast('No se pudo guardar', { description: res.error });
      }
    });
  }

  // Lista de productos + footer con total y botón Cobrar
  // hideHeader: true cuando el sheet tiene su propio título
  function CartBody({ hideHeader = false }: { hideHeader?: boolean }) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Header — solo en sidebar desktop */}
        {!hideHeader && (
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-4">
            <div>
              <p className="text-xs text-muted-foreground">{negocio}</p>
              <h2 className="text-lg font-semibold">
                {enMesa ? mesa : 'Tu venta'}
              </h2>
              {cuentaId ? (
                <p className="text-xs text-[var(--utilidad)]">Cuenta abierta · cobra al final</p>
              ) : mesaId ? (
                <p className="text-xs text-muted-foreground">Pedido nuevo para esta mesa</p>
              ) : null}
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
        )}

        {/* Items */}
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p>Toca un producto para agregarlo a la venta.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto space-y-2 px-3 py-3">
            {items.map((i) => (
              <li key={i.lineId} className="rounded-xl bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCOP(i.precio_venta)} c/u
                    </p>
                  </div>
                  <button
                    onClick={() => remove(i.lineId)}
                    className="text-muted-foreground hover:text-[var(--egreso)]"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCantidad(i.lineId, i.cantidad - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-8 text-center text-sm font-medium tabular-nums">
                      {i.cantidad}
                    </span>
                    <button
                      onClick={() => setCantidad(i.lineId, i.cantidad + 1)}
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

        {/* Footer con total y botón Cobrar */}
        <div
          className="shrink-0 space-y-3 border-t px-4 pt-4"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}
        >
          {!empty && <ClienteSearch />}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-3xl font-bold tabular-nums">{formatCOP(total)}</span>
          </div>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold"
            disabled={empty}
            onClick={abrirCobro}
          >
            Cobrar {!empty && formatCOP(total)}
          </Button>

          {/* Dejar la cuenta abierta para seguirle agregando (mesas). Si ya se
              sabe la mesa (viene del plano), guarda directo sin preguntar. */}
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl gap-2"
            disabled={empty || guardando}
            onClick={() => (mesaId && mesa ? guardarEnMesa(mesa) : setMesaPicker(true))}
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UtensilsCrossed className="h-4 w-4" />
            )}
            {cuentaId
              ? `Actualizar ${mesa ?? 'la cuenta'}`
              : mesaId
                ? `Guardar en ${mesa}`
                : 'Guardar en mesa'}
          </Button>
        </div>

      </div>
    );
  }

  return (
    <>
      {/*
        El modal de cobro se monta UNA sola vez y FUERA de CartBody. Antes vivía
        dentro, y como CartBody se vuelve a crear en cada render del carrito,
        React lo desmontaba y lo volvía a montar: al terminar una venta el
        carrito se vaciaba, eso re-renderizaba, y el modal reaparecía desde cero
        en el paso "elige método" con total $0. Además se montaba dos veces (una
        en el panel de escritorio y otra en el de celular).
      */}
      <PaymentModal
        open={payOpen}
        breb={breb}
        onClose={() => setPayOpen(false)}
        practica={practica}
        onSuccess={() => {
          setPayOpen(false);
          setOpen(false);
          if (volverAMesas.current) {
            volverAMesas.current = false;
            router.push('/dashboard/mesas');
          }
        }}
      />

      <MesaPicker
        open={mesaPicker}
        valorInicial={mesa}
        guardando={guardando}
        mesas={mesasSalon}
        onCancel={() => setMesaPicker(false)}
        onConfirm={(etiqueta, idMesa) => guardarEnMesa(etiqueta, idMesa ?? null)}
      />

      {/* ── Desktop: sidebar fijo al lado derecho ── */}
      <aside className="hidden lg:flex lg:w-96 lg:flex-col lg:border-l lg:bg-sidebar">
        {CartBody({})}
      </aside>

      {/* ── Mobile: barra sticky — solo cuando hay productos ── */}
      {!empty && (
        <div
          className="fixed left-0 right-0 z-20 px-4 lg:hidden"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-foreground px-5 py-4 text-background shadow-xl"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 shrink-0" />
              <span className="font-semibold">
                {enMesa && mesa ? `${mesa} · ` : ''}
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tabular-nums">{formatCOP(total)}</span>
              <span className="rounded-lg bg-background/20 px-3 py-1 text-sm font-semibold">
                Cobrar
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ── Mobile: bottom sheet del carrito ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 animate-in fade-in" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom"
            style={{ height: '85dvh' }}
          >
            {/* Header del sheet */}
            <div className="relative flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
              <p className="text-base font-semibold">
                {enMesa && mesa ? mesa : 'Tu venta'}
                {!empty && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    · {totalItems} {totalItems === 1 ? 'item' : 'items'}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3">
                {!empty && (
                  <button
                    onClick={clear}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Vaciar
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body del carrito ocupa el resto */}
            <div className="flex flex-1 min-h-0 flex-col">
              {CartBody({ hideHeader: true })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

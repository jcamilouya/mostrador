'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  X,
  UtensilsCrossed,
  Loader2,
  ChefHat,
  MessageSquareText,
  Bike,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import { guardarCuenta } from '@/lib/mesas/actions';
import { MesaPicker, type MesaParaElegir } from '@/components/mesas/MesaPicker';
import { PaymentModal } from './PaymentModal';
import { ClienteSearch } from './ClienteSearch';
import type { BrebConfig } from '@/lib/breb/queries';

/** Las notas que más se repiten en cocina: un toque y listo. */
const NOTAS = ['Sin cebolla', 'Sin sal', 'Bien asado', 'Término medio', 'Sin hielo', 'Salsa aparte', 'Para llevar'];

export function Cart({
  negocio,
  breb,
  practica = false,
  mesasSalon = [],
  puedeCobrar = true,
}: {
  negocio: string;
  breb: BrebConfig;
  /** Modo práctica: la venta se simula y no se guarda. */
  practica?: boolean;
  /** Mesas del plano del salón, para elegir a cuál va el pedido. */
  mesasSalon?: MesaParaElegir[];
  /** El rol puede cerrar ventas (023). El mesero, solo si el dueño lo activa. */
  puedeCobrar?: boolean;
}) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const setCantidad = useCart((s) => s.setCantidad);
  const setNota = useCart((s) => s.setNota);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const total = useCart((s) => s.total());
  const totalItems = useCart((s) => s.totalItems());
  const cuentaId = useCart((s) => s.cuentaId);
  const mesa = useCart((s) => s.mesa);
  const mesaId = useCart((s) => s.mesaId);
  const huella = useCart((s) => s.huella);
  const pedido = useCart((s) => s.pedido);
  const cliente = useCart((s) => s.cliente);
  const cobrarAlAbrir = useCart((s) => s.cobrarAlAbrir);
  const setCobrarAlAbrir = useCart((s) => s.setCobrarAlAbrir);

  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [mesaPicker, setMesaPicker] = useState(false);
  const [notaDe, setNotaDe] = useState<string | null>(null);
  const [notaTexto, setNotaTexto] = useState('');
  const [guardando, startGuardar] = useTransition();
  // El cobro empezó desde el plano: al terminar se vuelve a Mesas. Se guarda
  // aparte porque el carrito se vacía en cuanto la venta queda registrada.
  const volverAMesas = useRef(false);

  const empty = items.length === 0;
  const enMesa = Boolean(cuentaId || mesaId);
  const esDomicilio = pedido?.tipo === 'domicilio';
  const esLlevar = pedido?.tipo === 'llevar';
  /** Hay cocina de por medio: notas por plato y botón Marchar. */
  const conCocina = enMesa || Boolean(pedido) || Boolean(cuentaId);
  const porMarchar = items.reduce((a, i) => a + Math.max(0, i.cantidad - (i.enCocina ?? 0)), 0);

  // Tocaron "Cobrar" en el plano: el modal de cobro se abre al llegar.
  useEffect(() => {
    if (cobrarAlAbrir && items.length > 0) {
      setCobrarAlAbrir(false);
      if (puedeCobrar) abrirCobro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrarAlAbrir, items.length]);

  function abrirCobro() {
    volverAMesas.current = Boolean(cuentaId);
    setPayOpen(true);
  }

  /**
   * Guarda la cuenta abierta (mesa, domicilio o nombre libre). Con `marchar`,
   * además manda a cocina lo nuevo y sale la comanda.
   */
  function guardarEnMesa(etiqueta: string, idMesa: string | null = mesaId, marchar = false) {
    if (!etiqueta) return;

    startGuardar(async () => {
      const res = await guardarCuenta({
        venta_id: cuentaId,
        mesa: etiqueta,
        mesa_id: idMesa,
        huella,
        marchar,
        tipo_pedido: esDomicilio ? 'domicilio' : idMesa ? 'mesa' : null,
        domicilio: esDomicilio ? pedido.datos : null,
        cliente_id: cliente?.id ?? null,
        items: items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          nombre: i.nombre,
          variante: i.variante ?? null,
          insumo_extra_id: i.insumo_extra_id ?? null,
          nota: i.nota ?? null,
        })),
      });
      if (!res.ok) {
        toast('No se pudo guardar', { description: res.error });
        return;
      }
      if (res.comanda) {
        toast.success(`Comanda #${res.comanda} a cocina`, { description: `${etiqueta} · ${formatCOP(res.total)}` });
      } else {
        toast.success(`"${etiqueta}" guardada`, {
          description: `${formatCOP(res.total)} sin cobrar. La encuentras en Mesas.`,
        });
      }
      if (res.aviso) toast.error(res.aviso);
      clear();
      setOpen(false);
      setMesaPicker(false);
      // Con plano (o domicilio), se vuelve al salón a atender lo siguiente.
      if (idMesa || esDomicilio || cuentaId) router.push('/dashboard/mesas');
      else router.refresh();
    });
  }

  function abrirNota(lineId: string, actual: string | null | undefined) {
    if (notaDe === lineId) return setNotaDe(null);
    setNotaDe(lineId);
    setNotaTexto(actual ?? '');
  }

  function ponerNota(lineId: string, nota: string | null) {
    setNota(lineId, nota);
    setNotaDe(null);
  }

  const titulo = enMesa || pedido ? (mesa ?? 'Pedido') : 'Tu venta';
  const subtitulo = cuentaId
    ? 'Cuenta abierta · cobra al final'
    : mesaId
      ? 'Pedido nuevo para esta mesa'
      : esDomicilio
        ? `${pedido.datos.direccion} · ${pedido.datos.telefono}`
        : esLlevar
          ? 'Se cobra ahora y sale a cocina'
          : null;

  // Lista de productos + footer con total y botón Cobrar
  // hideHeader: true cuando el sheet tiene su propio título
  function CartBody({ hideHeader = false }: { hideHeader?: boolean }) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Header — solo en sidebar desktop */}
        {!hideHeader && (
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{negocio}</p>
              <h2 className="truncate text-lg font-semibold">{titulo}</h2>
              {subtitulo && (
                <p
                  className={`truncate text-xs ${cuentaId ? 'text-[var(--utilidad)]' : 'text-muted-foreground'}`}
                >
                  {subtitulo}
                </p>
              )}
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
            {items.map((i) => {
              const enCocina = i.enCocina ?? 0;
              return (
                <li key={i.lineId} className="rounded-xl bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCOP(i.precio_venta)} c/u
                        {conCocina && enCocina > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--ingreso)]">
                            · <ChefHat className="h-3 w-3" /> {enCocina} en cocina
                          </span>
                        )}
                      </p>
                      {i.nota && (
                        <p className="mt-0.5 text-xs font-medium text-[var(--utilidad)]">↳ {i.nota}</p>
                      )}
                    </div>
                    {conCocina && (
                      <button
                        onClick={() => abrirNota(i.lineId, i.nota)}
                        className={`hover:text-foreground ${i.nota ? 'text-[var(--utilidad)]' : 'text-muted-foreground'}`}
                        aria-label={`Nota para ${i.nombre}`}
                      >
                        <MessageSquareText className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (enCocina > 0 && !confirm(`${i.nombre} ya está en cocina. ¿Quitarlo? Saldrá ANULADO en cocina.`)) return;
                        remove(i.lineId);
                      }}
                      className="text-muted-foreground hover:text-[var(--egreso)]"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {notaDe === i.lineId && (
                    <div className="mt-2 space-y-2 rounded-lg bg-secondary/60 p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {NOTAS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => ponerNota(i.lineId, n)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                              i.nota === n ? 'bg-foreground text-background' : 'bg-background'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <form
                        className="flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          ponerNota(i.lineId, notaTexto);
                        }}
                      >
                        <input
                          value={notaTexto}
                          onChange={(e) => setNotaTexto(e.target.value)}
                          maxLength={140}
                          placeholder="Otra nota…"
                          aria-label="Escribir nota"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm"
                        />
                        <button type="submit" className="rounded-lg bg-foreground px-3 text-xs font-semibold text-background">
                          Listo
                        </button>
                        {i.nota && (
                          <button
                            type="button"
                            onClick={() => ponerNota(i.lineId, null)}
                            className="rounded-lg px-2 text-xs text-muted-foreground"
                          >
                            Quitar
                          </button>
                        )}
                      </form>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (i.cantidad - 1 < enCocina && !confirm(`${i.nombre} ya está en cocina. ¿Quitar uno? Saldrá ANULADO en cocina.`)) return;
                          setCantidad(i.lineId, i.cantidad - 1);
                        }}
                        aria-label={`Uno menos de ${i.nombre}`}
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
                        aria-label={`Uno más de ${i.nombre}`}
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
              );
            })}
          </ul>
        )}

        {/* Footer con total y botones */}
        <div
          className="shrink-0 space-y-3 border-t px-4 pt-4"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}
        >
          {!empty && !esDomicilio && <ClienteSearch />}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-3xl font-bold tabular-nums">{formatCOP(total)}</span>
          </div>
          {Botones()}
        </div>
      </div>
    );
  }

  /** Los botones cambian según qué es: mesa, para llevar, domicilio o venta. */
  function Botones() {
    const cargando = guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : null;

    // Domicilio: se marcha ya y se cobra cuando lo entreguen.
    if (esDomicilio) {
      return (
        <>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold gap-2"
            disabled={empty || guardando}
            onClick={() => guardarEnMesa(mesa ?? 'Domicilio', null, true)}
          >
            {cargando ?? <Bike className="h-5 w-5" />} Marchar domicilio
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            disabled={empty || guardando}
            onClick={() => guardarEnMesa(mesa ?? 'Domicilio', null, false)}
          >
            Guardar sin marchar
          </Button>
        </>
      );
    }

    // Para llevar: se cobra de una vez y la comanda sale con el cobro.
    if (esLlevar) {
      return puedeCobrar ? (
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold gap-2"
          disabled={empty}
          onClick={abrirCobro}
        >
          <ChefHat className="h-5 w-5" /> Cobrar y marchar {!empty && formatCOP(total)}
        </Button>
      ) : (
        <p className="rounded-2xl bg-secondary p-3 text-center text-sm text-muted-foreground">
          Los pedidos para llevar los cobra la caja.
        </p>
      );
    }

    // Mesa: lo normal es marchar; cobrar va aparte.
    if (enMesa && mesa) {
      return (
        <>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold gap-2"
            disabled={empty || guardando}
            onClick={() => guardarEnMesa(mesa, mesaId, true)}
          >
            {cargando ?? <ChefHat className="h-5 w-5" />}
            {porMarchar > 0 ? `Marchar ${porMarchar} a cocina` : `Guardar ${mesa}`}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-12 rounded-2xl gap-1.5"
              disabled={empty || guardando}
              onClick={() => (mesaId ? guardarEnMesa(mesa, mesaId, false) : setMesaPicker(true))}
            >
              <UtensilsCrossed className="h-4 w-4" /> {cuentaId ? `Actualizar ${mesa}` : 'Sin marchar'}
            </Button>
            {puedeCobrar ? (
              <Button variant="outline" className="h-12 rounded-2xl" disabled={empty} onClick={abrirCobro}>
                Cobrar {!empty && formatCOP(total)}
              </Button>
            ) : (
              <span className="flex items-center justify-center rounded-2xl bg-secondary px-2 text-center text-xs text-muted-foreground">
                Cobra la caja
              </span>
            )}
          </div>
        </>
      );
    }

    // Venta normal de mostrador.
    return (
      <>
        {puedeCobrar && (
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold"
            disabled={empty}
            onClick={abrirCobro}
          >
            Cobrar {!empty && formatCOP(total)}
          </Button>
        )}
        {/* Dejar la cuenta abierta para seguirle agregando (mesas). */}
        <Button
          variant="outline"
          className="h-12 w-full rounded-2xl gap-2"
          disabled={empty || guardando}
          onClick={() => setMesaPicker(true)}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
          Guardar en mesa
        </Button>
      </>
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
            <div className="flex min-w-0 items-center gap-2">
              <ShoppingBag className="h-5 w-5 shrink-0" />
              <span className="truncate font-semibold">
                {(enMesa || pedido) && mesa ? `${mesa} · ` : ''}
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-lg font-bold tabular-nums">{formatCOP(total)}</span>
              <span className="rounded-lg bg-background/20 px-3 py-1 text-sm font-semibold">
                {enMesa || esDomicilio ? 'Ver' : 'Cobrar'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ── Mobile: bottom sheet del carrito ── */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom"
            style={{ height: '85dvh' }}
          >
            {/* Header del sheet */}
            <div className="relative flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
              <p className="min-w-0 truncate text-base font-semibold">
                {titulo}
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
                  aria-label="Cerrar"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body del carrito ocupa el resto */}
            <div className="flex flex-1 min-h-0 flex-col">{CartBody({ hideHeader: true })}</div>
          </div>
        </div>
      )}
    </>
  );
}

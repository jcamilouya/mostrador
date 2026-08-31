'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Banknote, QrCode, ArrowLeftRight, CheckCircle2, Loader2, Settings, Copy, Store, CreditCard } from 'lucide-react';
import { BrebQR } from '@/components/breb/BrebQR';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import { registrarVenta } from '@/lib/pos/actions';
import { cobrarCuenta } from '@/lib/mesas/actions';
import { abrirWhatsAppRecibo, type ReciboData } from '@/lib/recibo';
import { guardarClienteDesdeRecibo } from '@/lib/clientes/actions';
import type { MetodoPago } from '@/lib/pos/types';
import type { BrebConfig } from '@/lib/breb/queries';

type Step = 'metodo' | 'efectivo' | 'breb' | 'transferencia' | 'tarjeta' | 'exito' | 'error';

export function PaymentModal({
  open,
  breb,
  practica = false,
  onClose,
  onSuccess,
}: {
  open: boolean;
  breb: BrebConfig;
  /** El negocio está aprendiendo: se simula la venta y NO se guarda nada. */
  practica?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const cliente = useCart((s) => s.cliente);
  const clear = useCart((s) => s.clear);
  // Si el carrito viene de una mesa, cobrar cierra ESA cuenta.
  const cuentaId = useCart((s) => s.cuentaId);
  const mesa = useCart((s) => s.mesa);

  const [step, setStep] = useState<Step>('metodo');
  const [recibido, setRecibido] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [numeroVenta, setNumeroVenta] = useState<number | null>(null);
  const [ventaIdActual, setVentaIdActual] = useState<string | null>(null);
  const [fuePendiente, setFuePendiente] = useState(false);
  const [reciboData, setReciboData] = useState<ReciboData | null>(null);
  const [telefono, setTelefono] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [guardarCli, setGuardarCli] = useState(true);
  // Snapshot del cliente vinculado en el carrito (antes de limpiarlo).
  const [clienteSnap, setClienteSnap] = useState<{ id: string; nombre: string; telefono: string | null } | null>(null);
  const [reciboEnviado, setReciboEnviado] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  // Llave única por cobro: si el internet se cae y se reintenta, no se duplica.
  const [idemKey, setIdemKey] = useState('');

  // Recargo por tarjeta. Se muestra aquí para que el cajero sepa cuánto pasar
  // por el datáfono, pero el monto que se guarda lo recalcula el servidor.
  const recargoPct = breb.recargoTarjetaPct ?? 0;
  const recargoTarjeta = recargoPct > 0 ? Math.round((total * recargoPct) / 100) : 0;
  const totalConRecargo = total + recargoTarjeta;

  useEffect(() => {
    if (open) {
      setStep('metodo');
      setRecibido(0);
      setError('');
      setNumeroVenta(null);
      setVentaIdActual(null);
      setFuePendiente(false);
      setReciboData(null);
      setTelefono('');
      setNombreCliente('');
      setGuardarCli(true);
      setClienteSnap(null);
      setReciboEnviado(false);
      setCopiado(false);
      setIdemKey(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    }
  }, [open]);

  const cambio = useMemo(() => Math.max(0, recibido - total), [recibido, total]);

  function copiarLlave() {
    if (!breb.llave) return;
    navigator.clipboard
      ?.writeText(breb.llave)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      })
      .catch(() => {});
  }

  const telDigits = telefono.replace(/\D/g, '');
  const telValido = telDigits.length >= 10;
  // ¿Hay algo que guardar en clientes? Cliente nuevo con nombre, o cliente
  // existente sin teléfono al que le acabamos de poner uno.
  const puedeGuardarCliente = clienteSnap
    ? !clienteSnap.telefono && telValido
    : nombreCliente.trim().length > 0;

  function enviarRecibo() {
    if (!reciboData) return;
    // Guardar/actualizar cliente en segundo plano si aplica.
    if (guardarCli && puedeGuardarCliente && ventaIdActual) {
      const payload = {
        ventaId: ventaIdActual,
        clienteId: clienteSnap?.id ?? null,
        nombre: clienteSnap ? clienteSnap.nombre : nombreCliente.trim(),
        telefono: telDigits,
      };
      startTransition(async () => {
        await guardarClienteDesdeRecibo(payload);
        router.refresh();
      });
    }
    abrirWhatsAppRecibo(reciboData, telefono);
    setReciboEnviado(true);
  }

  function confirmar(metodo: MetodoPago, confirmado?: boolean) {
    setError('');

    // PRÁCTICA: se ve igual que una venta real pero no se escribe NADA — ni la
    // venta, ni el inventario, ni el acumulado del cliente. Así no hay nada que
    // filtrar después en las cuentas ni nada que limpiar.
    if (practica) {
      setNumeroVenta(0);
      setFuePendiente(false);
      setReciboData(null);
      setStep('exito');
      clear();
      return;
    }

    startTransition(async () => {
      let res;
      try {
        res = cuentaId
          ? // Cuenta de mesa: se cierra la venta que ya existe, no se crea otra.
            await cobrarCuenta({
              venta_id: cuentaId,
              metodo_pago: metodo,
              mesa: mesa ?? undefined,
              cliente_id: cliente?.id ?? null,
              items: items.map((i) => ({
                producto_id: i.producto_id,
                cantidad: i.cantidad,
                nombre: i.nombre,
                variante: i.variante ?? null,
                insumo_extra_id: i.insumo_extra_id ?? null,
              })),
            })
          : await registrarVenta({
              metodo_pago: metodo,
              confirmado,
              cliente_id: cliente?.id ?? null,
              idempotency_key: idemKey,
              items: items.map((i) => ({
                producto_id: i.producto_id,
                cantidad: i.cantidad,
                precio_unitario: i.precio_venta,
                precio_compra: i.precio_compra,
                nombre: i.nombre,
                variante: i.variante ?? null,
                insumo_extra_id: i.insumo_extra_id ?? null,
              })),
            });
      } catch {
        // Nunca dejar el modal colgado: si algo revienta, mostrar error claro.
        setError('No pudimos completar la venta. Revisa tu internet e inténtalo de nuevo.');
        setStep('error');
        return;
      }
      if (!res.ok) {
        setError(res.error);
        setStep('error');
        return;
      }
      setNumeroVenta(res.numero);
      setVentaIdActual(res.ventaId);
      setFuePendiente(metodo === 'breb' && !confirmado);
      // Snapshot del cliente vinculado + prellenar teléfono para el recibo.
      setClienteSnap(cliente ? { ...cliente } : null);
      if (cliente?.telefono) setTelefono(cliente.telefono);
      // Snapshot del recibo ANTES de limpiar el carrito.
      setReciboData({
        negocio: breb.nombreNegocio,
        created_at: new Date().toISOString(),
        metodo_pago: metodo,
        total: res.total,
        items: items.map((i) => ({
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          subtotal: i.cantidad * i.precio_venta,
        })),
      });
      setStep('exito');
      clear();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'exito'
              ? practica
                ? 'Venta de práctica'
                : `Venta #${numeroVenta}`
              : step === 'error'
                ? 'Algo salió mal'
                : `Cobrar ${formatCOP(total)}`}
          </DialogTitle>
        </DialogHeader>

        {/* Malla de seguridad: cobrar un carrito vacío no significa nada. Si por
            cualquier motivo el modal queda abierto sin productos, se dice claro
            en vez de mostrar "Cobrar $ 0" con la lista de métodos. */}
        {step === 'metodo' && items.length === 0 && (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              El carrito está vacío. Agrega productos y vuelve a tocar Cobrar.
            </p>
            <Button className="w-full rounded-2xl" onClick={onClose}>
              Entendido
            </Button>
          </div>
        )}

        {step === 'metodo' && items.length > 0 && (
          <div className="space-y-2">
            <MetodoButton
              icon={Banknote}
              titulo="Efectivo"
              subtitulo="Calcula el cambio automáticamente"
              color="var(--ingreso)"
              onClick={() => {
                setRecibido(total);
                setStep('efectivo');
              }}
            />
            <MetodoButton
              icon={QrCode}
              titulo="Bre-B"
              subtitulo="El cliente paga a tu llave desde cualquier banco"
              color="var(--utilidad)"
              onClick={() => setStep('breb')}
            />
            <MetodoButton
              icon={ArrowLeftRight}
              titulo="Transferencia"
              subtitulo="Cliente transfiere y tú confirmas"
              color="var(--egreso)"
              onClick={() => setStep('transferencia')}
            />
            <MetodoButton
              icon={CreditCard}
              titulo="Tarjeta"
              subtitulo={
                recargoPct > 0
                  ? `Se le suma el ${recargoPct}% al total`
                  : 'Débito o crédito en el datáfono'
              }
              color="var(--chart-4)"
              onClick={() => setStep('tarjeta')}
            />
          </div>
        )}

        {step === 'tarjeta' && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl bg-secondary/50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Productos</span>
                <span className="tabular-nums">{formatCOP(total)}</span>
              </div>
              {recargoTarjeta > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recargo tarjeta ({recargoPct}%)</span>
                  <span className="tabular-nums">{formatCOP(recargoTarjeta)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Cóbrale</span>
                <span className="tabular-nums">{formatCOP(totalConRecargo)}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {recargoPct > 0 ? (
                <>
                  Pasa <strong>{formatCOP(totalConRecargo)}</strong> por el datáfono. El recargo
                  queda registrado aparte en tus reportes.
                </>
              ) : (
                <>
                  Pasa <strong>{formatCOP(totalConRecargo)}</strong> por el datáfono. Si quieres
                  cobrar un porcentaje extra por tarjeta, actívalo en Configuración.
                </>
              )}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-2xl"
                onClick={() => setStep('metodo')}
              >
                Atrás
              </Button>
              <Button
                className="flex-1 rounded-2xl gap-2"
                disabled={pending}
                onClick={() => confirmar('tarjeta')}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Cobrado
              </Button>
            </div>
          </div>
        )}

        {step === 'efectivo' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recibido">¿Cuánto te dio el cliente?</Label>
              <Input
                id="recibido"
                type="number"
                min={total}
                step="500"
                value={recibido}
                onChange={(e) => setRecibido(Number(e.target.value) || 0)}
                autoFocus
                className="rounded-xl h-14 text-2xl font-semibold tabular-nums text-center"
              />
              <div className="flex flex-wrap gap-2">
                {[total, 20000, 50000, 100000].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRecibido(m)}
                    className="rounded-full bg-secondary px-3 py-1 text-xs"
                  >
                    {formatCOP(m)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-secondary p-4 text-center">
              <p className="text-xs text-muted-foreground">Cambio</p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--ingreso)]">
                {formatCOP(cambio)}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setStep('metodo')}
                disabled={pending}
              >
                Atrás
              </Button>
              <Button
                className="flex-1 rounded-2xl h-12"
                onClick={() => confirmar('efectivo')}
                disabled={recibido < total || pending}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Confirmar venta'
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'breb' && (
          breb.configurado ? (
            <div className="space-y-4">
              {breb.qrPayload && (
                <div
                  className="flex flex-col items-center gap-2 rounded-2xl p-4"
                  style={{ backgroundColor: 'color-mix(in oklch, var(--utilidad) 12%, transparent)' }}
                >
                  <p className="text-xs text-muted-foreground">
                    El cliente <strong>escanea</strong> este QR desde la app de cualquier banco:
                  </p>
                  <BrebQR overridePayload={breb.qrPayload} size={208} />
                  <p className="text-sm">
                    Monto a pagar:{' '}
                    <span className="font-semibold tabular-nums">{formatCOP(total)}</span>
                  </p>
                </div>
              )}

              {breb.llave && (
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ backgroundColor: 'color-mix(in oklch, var(--utilidad) 12%, transparent)' }}
                >
                  <p className="text-xs text-muted-foreground">
                    {breb.qrPayload
                      ? '¿No puede escanear? También puede pagar a esta llave:'
                      : (<>Dile al cliente que te pague por <strong>Bre-B</strong> a esta llave:</>)}
                  </p>
                  <button
                    type="button"
                    onClick={copiarLlave}
                    className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl bg-card px-4 py-2 shadow-sm"
                  >
                    <span className="break-all text-xl font-bold tracking-wide">{breb.llave}</span>
                    <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <p className="mt-1 h-4 text-xs text-[var(--ingreso)]">
                    {copiado ? '✓ Llave copiada' : ''}
                  </p>
                  {breb.banco && (
                    <p className="text-xs text-muted-foreground">Cuenta en {breb.banco}</p>
                  )}
                  {!breb.qrPayload && (
                    <p className="mt-2 text-sm">
                      Monto a pagar:{' '}
                      <span className="font-semibold tabular-nums">{formatCOP(total)}</span>
                    </p>
                  )}
                </div>
              )}

              {!breb.qrPayload && (
                <div className="space-y-1 rounded-2xl bg-secondary/50 p-3 text-left text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    ¿Cómo paga el cliente? (desde cualquier banco)
                  </p>
                  <p>1. Abre la app de su banco y entra a <strong>Bre-B</strong>.</p>
                  <p>2. Elige “Enviar / pagar a una llave”.</p>
                  <p>3. Escribe tu llave y paga {formatCOP(total)}.</p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  className="w-full rounded-2xl h-12"
                  onClick={() => confirmar('breb', true)}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ya me pagó'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-2xl"
                  onClick={() => confirmar('breb', false)}
                  disabled={pending}
                >
                  Dejar pendiente
                </Button>
                <button
                  type="button"
                  onClick={() => setStep('metodo')}
                  disabled={pending}
                  className="w-full pt-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cambiar método de pago
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                <QrCode className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Aún no has configurado tu llave Bre-B. Agrégala una vez y podrás cobrar con
                QR sin comisión.
              </p>
              <Link href="/dashboard/configuracion" className="block">
                <Button className="w-full rounded-2xl h-12 gap-2">
                  <Settings className="h-4 w-4" /> Configurar Bre-B
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setStep('metodo')}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                Volver
              </button>
            </div>
          )
        )}

        {step === 'transferencia' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirma cuando el cliente te haya enviado la transferencia.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setStep('metodo')}
                disabled={pending}
              >
                Atrás
              </Button>
              <Button
                className="flex-1 rounded-2xl h-12"
                onClick={() => confirmar('transferencia')}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ya me llegó'}
              </Button>
            </div>
          </div>
        )}

        {step === 'exito' && (
          <div className="space-y-4 text-center">
            {/* Sello grande: se ve de lejos, en medio del servicio. */}
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
              <span
                className={`vendido-onda absolute inset-0 rounded-full ${
                  fuePendiente ? 'bg-[var(--utilidad)]/40' : 'bg-[var(--ingreso)]/40'
                }`}
                aria-hidden="true"
              />
              <span
                className={`vendido-sello relative flex h-24 w-24 items-center justify-center rounded-full ${
                  fuePendiente ? 'bg-[var(--utilidad)]/15' : 'bg-[var(--ingreso)]/15'
                }`}
              >
                <CheckCircle2
                  className={`h-12 w-12 ${
                    fuePendiente ? 'text-[var(--utilidad)]' : 'text-[var(--ingreso)]'
                  }`}
                  strokeWidth={2.5}
                />
              </span>
            </div>

            <div className="vendido-texto space-y-1">
              <p
                className={`text-3xl font-bold tracking-tight ${
                  fuePendiente ? 'text-[var(--utilidad)]' : 'text-[var(--ingreso)]'
                }`}
              >
                {practica ? '¡Así se vende!' : fuePendiente ? 'Pendiente' : '¡Vendido!'}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {reciboData ? formatCOP(reciboData.total) : formatCOP(total)}
              </p>
              <p className="text-sm text-muted-foreground">
                {practica
                  ? 'Así se ve una venta. Esto NO se guardó en tus cuentas: fue práctica.'
                  : fuePendiente
                    ? `Venta #${numeroVenta} quedó pendiente. Confírmala desde "Ventas de hoy" cuando recibas el pago.`
                    : `Venta #${numeroVenta} registrada. Ya puedes seguir con la siguiente.`}
              </p>
            </div>

            {/* Recibo por WhatsApp — sin API de Meta, abre wa.me en el celular */}
            {reciboData && (
              <div className="space-y-3 rounded-2xl bg-secondary/50 p-3 text-left">
                <p className="text-center text-sm font-medium">
                  {clienteSnap
                    ? `Enviar recibo a ${clienteSnap.nombre}`
                    : '¿Enviar recibo al cliente?'}
                </p>

                {/* Nombre — solo si es cliente nuevo (no se eligió uno en el carrito) */}
                {!clienteSnap && (
                  <Input
                    type="text"
                    value={nombreCliente}
                    onChange={(e) => setNombreCliente(e.target.value)}
                    placeholder="Nombre del cliente (opcional)"
                    className="h-11 w-full rounded-xl"
                  />
                )}

                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">🇨🇴 +57</span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="310 555 1234"
                    className="h-11 flex-1 rounded-xl"
                  />
                </div>

                {/* Guardar cliente — aparece cuando hay algo nuevo que guardar */}
                {puedeGuardarCliente && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={guardarCli}
                      onChange={(e) => setGuardarCli(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span>
                      {clienteSnap
                        ? 'Guardar este número en su ficha'
                        : 'Guardar como cliente nuevo'}
                    </span>
                  </label>
                )}

                <Button
                  className="w-full rounded-2xl gap-2"
                  variant={reciboEnviado ? 'outline' : 'default'}
                  onClick={enviarRecibo}
                  disabled={!telValido}
                >
                  📱 {reciboEnviado ? 'Abrir de nuevo' : 'Enviar recibo por WhatsApp'}
                </Button>
                {reciboEnviado && guardarCli && puedeGuardarCliente && (
                  <p className="text-center text-xs text-[var(--ingreso)]">
                    ✓ Cliente guardado
                  </p>
                )}
              </div>
            )}

            <Button
              size="lg"
              className="w-full rounded-2xl h-12 gap-2"
              onClick={onSuccess}
            >
              <Store className="h-5 w-5" /> Seguir vendiendo
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4 text-center">
            <p className="rounded-2xl bg-[var(--egreso)]/10 p-4 text-sm text-[var(--egreso)]">
              {error}
            </p>
            <Button
              className="w-full rounded-2xl"
              onClick={() => setStep('metodo')}
            >
              Reintentar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetodoButton({
  icon: Icon,
  titulo,
  subtitulo,
  color,
  onClick,
}: {
  icon: typeof Banknote;
  titulo: string;
  subtitulo: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-sm transition-colors hover:bg-secondary"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)` }}
      >
        <Icon className="h-6 w-6" style={{ color }} />
      </span>
      <div className="flex-1">
        <p className="font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
      </div>
    </button>
  );
}

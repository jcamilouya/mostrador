'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import jsQR from 'jsqr';
import { Store, QrCode, Loader2, Check, Info, Upload, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrebQR } from '@/components/breb/BrebQR';
import { formatCOP } from '@/lib/utils/format';
import { guardarConfiguracion, type ConfigState } from '@/lib/breb/actions';
import { validarPayloadEmv } from '@/lib/breb/emv';
import { BANCOS_COLOMBIA } from '@/lib/breb/schemas';
import type { BrebConfig } from '@/lib/breb/queries';

/** Tipos de negocio. El valor se guarda tal cual y decide el menú del celular. */
const TIPOS_NEGOCIO = [
  { value: 'restaurante', label: '🍽️ Restaurante' },
  { value: 'cafeteria', label: '☕ Cafetería' },
  { value: 'bar', label: '🍺 Bar' },
  { value: 'panaderia', label: '🥐 Panadería' },
  { value: 'tienda', label: '🏪 Tienda o minimercado' },
  { value: 'ropa', label: '👕 Ropa y accesorios' },
  { value: 'servicios', label: '🔧 Servicios' },
  { value: 'otro', label: '📦 Otro' },
];

/**
 * Lee una imagen (foto o pantallazo) y devuelve el contenido del QR que tenga,
 * o null si no encuentra ninguno. Corre 100% en el navegador del negocio.
 */
async function decodificarQRDeImagen(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      i.src = url;
    });
    // Reescalar imágenes grandes para que jsQR sea rápido sin perder lectura.
    const maxDim = 1200;
    const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * escala));
    const h = Math.max(1, Math.round(img.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const code = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
    return code?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full rounded-2xl gap-2 sm:w-auto" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
        </>
      ) : (
        'Guardar cambios'
      )}
    </Button>
  );
}

export function ConfigForm({
  empresa,
  breb,
}: {
  empresa: {
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    nit: string | null;
    categoria: string | null;
    whatsapp_numero: string | null;
  };
  breb: BrebConfig;
}) {
  const [state, formAction] = useActionState<ConfigState, FormData>(
    guardarConfiguracion,
    {},
  );
  const [nombre, setNombre] = useState(empresa.nombre);
  const [recargoTarjeta, setRecargoTarjeta] = useState(String(breb.recargoTarjetaPct ?? 0));
  const [llave, setLlave] = useState(breb.llave ?? '');

  // QR oficial del negocio (payload EMVCo decodificado de la imagen que sube).
  const [qrPayload, setQrPayload] = useState(breb.qrPayload ?? '');
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permitir volver a subir el mismo archivo
    if (!file) return;
    setQrError('');
    setQrLoading(true);
    try {
      const payload = await decodificarQRDeImagen(file);
      if (!payload) {
        setQrError(
          'No encontramos un QR en la imagen. Sube un pantallazo nítido del QR (no una foto de lejos).',
        );
        return;
      }
      if (!validarPayloadEmv(payload)) {
        setQrError(
          'La imagen tiene un QR, pero no parece un QR de pago Bre-B. Asegúrate de subir el QR de cobro de tu banco.',
        );
        return;
      }
      setQrPayload(payload);
    } catch {
      setQrError('No pudimos procesar la imagen. Intenta con otra captura.');
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-8">
      {/* Datos del negocio */}
      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Datos del negocio</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="nombre">Nombre del negocio</Label>
            <Input
              id="nombre"
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              name="telefono"
              type="tel"
              defaultValue={empresa.telefono ?? ''}
              placeholder="300 123 4567"
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              name="direccion"
              defaultValue={empresa.direccion ?? ''}
              placeholder="Calle 123 #45-67"
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria">¿Qué tipo de negocio es?</Label>
            <select
              id="categoria"
              name="categoria"
              defaultValue={empresa.categoria ?? ''}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Sin especificar</option>
              {TIPOS_NEGOCIO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Define qué ves en el menú del celular. Los restaurantes, bares y cafeterías
              tienen Mesas a la mano.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nit">NIT (opcional)</Label>
            <Input
              id="nit"
              name="nit"
              defaultValue={empresa.nit ?? ''}
              placeholder="900.123.456-7"
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="whatsapp_numero">WhatsApp para registrar gastos (opcional)</Label>
            <Input
              id="whatsapp_numero"
              name="whatsapp_numero"
              type="tel"
              defaultValue={empresa.whatsapp_numero ?? ''}
              placeholder="+57 300 123 4567"
              className="rounded-xl h-11"
            />
            <p className="text-xs text-muted-foreground">
              El número desde el que le mandas fotos de facturas al bot.
            </p>
          </div>
        </div>
      </section>

      {/* Cobro con tarjeta */}
      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Cobro con tarjeta</h2>
        </header>

        <div className="max-w-md space-y-2">
          <Label htmlFor="recargo_tarjeta_pct">Recargo por pagar con tarjeta</Label>
          <div className="relative w-40">
            <Input
              id="recargo_tarjeta_pct"
              name="recargo_tarjeta_pct"
              type="number"
              step="0.5"
              min="0"
              max="20"
              value={recargoTarjeta}
              onChange={(e) => setRecargoTarjeta(e.target.value)}
              className="rounded-xl h-11 tabular-nums pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Déjalo en <strong>0</strong> si cobras lo mismo con tarjeta que en efectivo. Si
            pones un número, el POS le suma ese porcentaje al total cuando el cliente paga con
            tarjeta, y queda registrado aparte en tus reportes.
          </p>
          {Number(recargoTarjeta) > 0 && (
            <p className="rounded-xl bg-[var(--utilidad)]/10 p-3 text-xs">
              Con {recargoTarjeta}%, una venta de {formatCOP(50000)} se le cobra al cliente{' '}
              <strong>{formatCOP(50000 + Math.round((50000 * Number(recargoTarjeta)) / 100))}</strong>.
            </p>
          )}
        </div>
      </section>

      {/* Bre-B */}
      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Cobros con Bre-B</h2>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="breb_banco">Banco donde tienes la cuenta</Label>
              <select
                id="breb_banco"
                name="breb_banco"
                defaultValue={breb.banco ?? ''}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">Selecciona tu banco…</option>
                {BANCOS_COLOMBIA.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breb_llave">Tu llave Bre-B</Label>
              <Input
                id="breb_llave"
                name="breb_llave"
                value={llave}
                onChange={(e) => setLlave(e.target.value)}
                placeholder="Celular, correo o @llave registrada"
                className="rounded-xl h-11"
              />
              <p className="text-xs text-muted-foreground">
                Es la llave que registraste en tu banco para recibir pagos Bre-B.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breb_merchant_id">
                Merchant ID <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="breb_merchant_id"
                name="breb_merchant_id"
                defaultValue={breb.merchantId ?? ''}
                placeholder="Si tu banco te dio un ID de comercio"
                className="rounded-xl h-11"
              />
            </div>

            <div className="space-y-2 rounded-2xl bg-secondary/60 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Info className="h-4 w-4 shrink-0" /> ¿Cómo activar tus cobros Bre-B?
              </p>
              <p>
                <strong className="text-foreground">1.</strong> Registra tu llave Bre-B en la
                app de tu banco (sección “Bre-B” o “Llaves”). Tu llave puede ser tu celular,
                correo, NIT o un código tipo <span className="font-mono">@tunegocio</span>.
              </p>
              <p>
                <strong className="text-foreground">2.</strong> Escribe esa <strong>misma</strong>{' '}
                llave aquí arriba y guarda.
              </p>
              <p>
                <strong className="text-foreground">3.</strong> Listo: al cobrar con Bre-B en el
                POS le muestras tu llave al cliente y él te paga desde{' '}
                <strong>cualquier banco</strong>. La plata llega a tu cuenta.
              </p>
              <p className="text-[var(--utilidad)]">
                💡 ¿Quieres que el cliente <strong>escanee</strong> en vez de digitar tu
                llave? Sube tu QR oficial Bre-B aquí abajo.
              </p>
            </div>
          </div>

          {/* Preview de la llave */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-secondary/40 p-5 text-center">
            <div className="rounded-2xl bg-card px-5 py-4 shadow-sm">
              <p className="text-xs text-muted-foreground">Tu llave Bre-B</p>
              <p className="mt-1 break-all text-2xl font-bold tracking-wide">{llave || '—'}</p>
            </div>
            <p className="text-sm font-medium">
              {llave ? 'Esto verá el cliente al cobrar' : 'Ingresa tu llave para verla aquí'}
            </p>
            <p className="text-xs text-muted-foreground">
              El cliente le paga a esta llave por Bre-B desde cualquier banco.
            </p>
          </div>
        </div>

        {/* QR oficial escaneable — sirve para CUALQUIER banco */}
        <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--utilidad)]/15">
              <QrCode className="h-5 w-5 text-[var(--utilidad)]" />
            </span>
            <div className="flex-1">
              <p className="font-medium">QR escaneable (recomendado)</p>
              <p className="text-xs text-muted-foreground">
                Sube tu QR Bre-B oficial —el que te muestra la app de tu banco— y tus
                clientes lo escanean en el cobro en vez de digitar la llave. Funciona con
                cualquier banco.
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onQrFile}
            className="hidden"
          />
          {/* El payload viaja con el formulario al guardar */}
          <input type="hidden" name="breb_qr_payload" value={qrPayload} />

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {qrPayload ? (
              <BrebQR overridePayload={qrPayload} size={160} />
            ) : (
              <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                <QrCode className="h-12 w-12" />
              </div>
            )}

            <div className="flex-1 space-y-2 text-center sm:text-left">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={qrLoading}
              >
                {qrLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {qrPayload ? 'Cambiar QR' : 'Subir mi QR Bre-B'}
              </Button>

              {qrPayload && (
                <button
                  type="button"
                  onClick={() => {
                    setQrPayload('');
                    setQrError('');
                  }}
                  className="block text-xs text-muted-foreground hover:text-[var(--egreso)]"
                >
                  Quitar QR
                </button>
              )}

              {qrPayload && !qrError && (
                <p className="flex items-center justify-center gap-1 text-xs text-[var(--ingreso)] sm:justify-start">
                  <Check className="h-3.5 w-3.5" /> QR válido y listo para cobrar
                </p>
              )}
              {qrError && <p className="text-xs text-[var(--egreso)]">{qrError}</p>}

              <p className="text-[11px] text-muted-foreground">
                Tip: en la app de tu banco entra a “Bre-B / Mi QR”, toma un{' '}
                <strong>pantallazo</strong> y súbelo aquí.
              </p>
            </div>
          </div>
        </div>
      </section>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-2 rounded-xl bg-[var(--ingreso)]/10 px-4 py-3 text-sm text-[var(--ingreso)]">
          <Check className="h-4 w-4" /> Cambios guardados.
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

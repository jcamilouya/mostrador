'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Store, QrCode, Loader2, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrebQR } from '@/components/breb/BrebQR';
import { guardarConfiguracion, type ConfigState } from '@/lib/breb/actions';
import { BANCOS_COLOMBIA } from '@/lib/breb/schemas';
import type { BrebConfig } from '@/lib/breb/queries';

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
  empresa: { nombre: string; telefono: string | null; direccion: string | null };
  breb: BrebConfig;
}) {
  const [state, formAction] = useActionState<ConfigState, FormData>(
    guardarConfiguracion,
    {},
  );
  const [nombre, setNombre] = useState(empresa.nombre);
  const [llave, setLlave] = useState(breb.llave ?? '');

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

            <div className="flex items-start gap-2 rounded-2xl bg-secondary/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El QR usa el estándar EMVCo. El identificador oficial de Bre-B lo asigna tu
                banco al registrar tu llave — verifícalo con un cobro de prueba antes de
                usarlo con clientes.
              </span>
            </div>
          </div>

          {/* Preview del QR */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-secondary/40 p-5 text-center">
            <BrebQR llave={llave} nombre={nombre} />
            <p className="text-sm font-medium">
              {llave ? 'Así verán tu QR los clientes' : 'Ingresa tu llave para ver el QR'}
            </p>
            <p className="text-xs text-muted-foreground">
              Pruébalo escaneándolo desde la app de tu banco.
            </p>
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

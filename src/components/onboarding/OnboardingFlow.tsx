'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { crearEmpresa } from '@/app/onboarding/actions';
import { ArrowLeft, ArrowRight, Loader2, Store, Sparkles, MessageCircle } from 'lucide-react';

const CATEGORIAS = [
  'Tienda de barrio',
  'Peluquería / Barbería',
  'Ferretería',
  'Restaurante / Cafetería',
  'Panadería',
  'Papelería',
  'Otro',
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full rounded-2xl gap-2"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Creando tu negocio…
        </>
      ) : (
        <>
          ¡Listo, abrir el dashboard!
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}

export function OnboardingFlow({
  defaultEmail,
  initialPaso = 1,
}: {
  defaultEmail: string;
  initialPaso?: number;
}) {
  const [paso, setPaso] = useState(initialPaso);
  const [state, formAction] = useActionState(crearEmpresa, {});
  const [valores, setValores] = useState({
    nombre_negocio: '',
    email: defaultEmail,
    nit: '',
    direccion: '',
    telefono: '',
    categoria: '',
    whatsapp_numero: '',
  });

  const setCampo = (k: keyof typeof valores, v: string) =>
    setValores((prev) => ({ ...prev, [k]: v }));

  const puedeAvanzarPaso1 = valores.nombre_negocio.trim().length >= 2;

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden mirrors para el submit final */}
      <input type="hidden" name="nombre_negocio" value={valores.nombre_negocio} />
      <input type="hidden" name="email" value={valores.email} />
      <input type="hidden" name="nit" value={valores.nit} />
      <input type="hidden" name="direccion" value={valores.direccion} />
      <input type="hidden" name="telefono" value={valores.telefono} />
      <input type="hidden" name="categoria" value={valores.categoria} />
      <input type="hidden" name="whatsapp_numero" value={valores.whatsapp_numero} />

      {/* Progreso */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((p) => (
          <div
            key={p}
            className={`h-1.5 w-12 rounded-full transition-colors ${
              p <= paso ? 'bg-foreground' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {paso === 1 && (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card shadow-sm">
              <Store className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold">¿Cómo se llama tu negocio?</h2>
            <p className="text-sm text-muted-foreground">
              Esto es lo que tus clientes van a ver en los comprobantes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nn">Nombre del negocio</Label>
            <Input
              id="nn"
              value={valores.nombre_negocio}
              onChange={(e) => setCampo('nombre_negocio', e.target.value)}
              placeholder="Tienda Don Pedro"
              autoFocus
              required
              className="rounded-xl h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="em">Email del negocio</Label>
            <Input
              id="em"
              type="email"
              value={valores.email}
              onChange={(e) => setCampo('email', e.target.value)}
              placeholder="negocio@email.com"
              required
              className="rounded-xl h-12"
            />
            <p className="text-xs text-muted-foreground">
              Lo usamos para reportes y notificaciones. Puede ser distinto al tuyo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nit" className="flex items-center gap-2">
              NIT <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="nit"
              value={valores.nit}
              onChange={(e) => setCampo('nit', e.target.value)}
              placeholder="900.123.456-7"
              className="rounded-xl h-12"
            />
          </div>

          <Button
            type="button"
            size="lg"
            className="w-full rounded-2xl gap-2"
            disabled={!puedeAvanzarPaso1}
            onClick={() => setPaso(2)}
          >
            Siguiente
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card shadow-sm">
              <Sparkles className="h-6 w-6 text-[var(--utilidad)]" />
            </div>
            <h2 className="text-2xl font-semibold">Un par de detalles más</h2>
            <p className="text-sm text-muted-foreground">
              Todo es opcional. Puedes saltarlo y completarlo después.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat">¿Qué tipo de negocio es?</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIAS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCampo('categoria', c)}
                  className={`rounded-xl border px-3 py-2.5 text-sm text-left transition-colors ${
                    valores.categoria === c
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tel">Teléfono</Label>
            <Input
              id="tel"
              type="tel"
              value={valores.telefono}
              onChange={(e) => setCampo('telefono', e.target.value)}
              placeholder="300 123 4567"
              className="rounded-xl h-12"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dir">Dirección</Label>
            <Input
              id="dir"
              value={valores.direccion}
              onChange={(e) => setCampo('direccion', e.target.value)}
              placeholder="Calle 123 #45-67, Bogotá"
              className="rounded-xl h-12"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-2xl gap-2"
              onClick={() => setPaso(1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1 rounded-2xl gap-2"
              onClick={() => setPaso(3)}
            >
              Siguiente
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card shadow-sm">
              <MessageCircle className="h-6 w-6 text-[var(--ingreso)]" />
            </div>
            <h2 className="text-2xl font-semibold">¿Registras facturas por WhatsApp?</h2>
            <p className="text-sm text-muted-foreground">
              Toma foto de tu factura y nuestra IA la registra como gasto.
              Vinculamos tu número después; por ahora puedes saltar este paso.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa">
              Tu número de WhatsApp <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="wa"
              type="tel"
              value={valores.whatsapp_numero}
              onChange={(e) => setCampo('whatsapp_numero', e.target.value)}
              placeholder="+57 300 123 4567"
              className="rounded-xl h-12"
            />
          </div>

          {state.error && (
            <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
              {state.error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-2xl gap-2"
              onClick={() => setPaso(2)}
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <div className="flex-1">
              <SubmitButton />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

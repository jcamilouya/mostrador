'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { crearEmpresa } from '@/app/onboarding/actions';
import { CartaPorFoto } from '@/components/inventory/CartaPorFoto';
import { ArrowRight, Loader2, Store, ShoppingCart } from 'lucide-react';

/**
 * Registro de un negocio nuevo. Dos pasos, no cinco.
 *
 * Antes pedía NIT, dirección, teléfono y WhatsApp ANTES de dejar entrar. Nada de
 * eso lo ayuda a vender hoy: ahora vive en Ajustes y se llena cuando haga falta.
 * Lo único que preguntamos es cómo se llama y qué vende; el resto del tiempo lo
 * gastamos en dejarle la carta cargada, que es el muro real del primer día.
 */

const TIPOS = [
  { value: 'restaurante', emoji: '🍽️', label: 'Restaurante' },
  { value: 'cafeteria', emoji: '☕', label: 'Cafetería' },
  { value: 'bar', emoji: '🍺', label: 'Bar' },
  { value: 'panaderia', emoji: '🥐', label: 'Panadería' },
  { value: 'tienda', emoji: '🏪', label: 'Tienda' },
  { value: 'ropa', emoji: '👕', label: 'Ropa' },
  { value: 'servicios', emoji: '🔧', label: 'Servicios' },
  { value: 'otro', emoji: '📦', label: 'Otro' },
];

function SubmitButton({ listo }: { listo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || !listo}
      className="h-14 w-full rounded-2xl gap-2 text-base font-semibold"
    >
      {pending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" /> Creando tu negocio…
        </>
      ) : (
        <>
          Continuar <ArrowRight className="h-5 w-5" />
        </>
      )}
    </Button>
  );
}

export function OnboardingFlow({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(crearEmpresa, {});
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('');
  const [creado, setCreado] = useState(false);
  const [cargados, setCargados] = useState(0);

  useEffect(() => {
    if (state.ok) setCreado(true);
  }, [state.ok]);

  function alPOS() {
    router.refresh();
    router.push('/dashboard/pos');
  }

  // ── Paso 2: dejarle la carta cargada ──
  if (creado) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-10">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
            📸
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            Ahora carguemos lo que vendes
          </h2>
          <p className="text-sm text-muted-foreground">
            Tómale una foto a tu carta y sacamos los platos con sus precios. Es lo único
            que se demora, y lo hacemos por ti.
          </p>
        </div>

        {cargados > 0 ? (
          <div className="space-y-4 rounded-3xl bg-[var(--ingreso)]/10 p-6 text-center">
            <p className="text-lg font-semibold text-[var(--ingreso)]">
              ¡Listo! {cargados} productos cargados
            </p>
            <p className="text-sm text-muted-foreground">
              Ya puedes vender. Vamos a que hagas tu primera venta de práctica.
            </p>
            <Button
              size="lg"
              onClick={alPOS}
              className="h-14 w-full rounded-2xl gap-2 text-base font-semibold"
            >
              <ShoppingCart className="h-5 w-5" /> Ir a vender
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-card p-5 shadow-sm">
              <CartaPorFoto compacto onListo={(n) => setCargados(n)} />
            </div>
            <button
              type="button"
              onClick={alPOS}
              className="w-full rounded-2xl p-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Lo hago después, llévame a la app
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Paso 1: quién eres ──
  return (
    <form action={formAction} className="mx-auto w-full max-w-lg space-y-6 px-4 py-10">
      <input type="hidden" name="email" value={defaultEmail} />
      <input type="hidden" name="categoria" value={tipo} />

      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <Store className="h-7 w-7" />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">Cuéntanos de tu negocio</h2>
        <p className="text-sm text-muted-foreground">
          Son dos preguntas. Los demás datos los pones después, cuando los necesites.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre_negocio">¿Cómo se llama tu negocio?</Label>
        <Input
          id="nombre_negocio"
          name="nombre_negocio"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Sabore Fast Food"
          required
          autoFocus
          className="h-12 rounded-2xl text-base"
        />
      </div>

      <div className="space-y-2">
        <Label>¿Qué vendes?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS.map((t) => {
            const activo = tipo === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-xs font-medium transition-transform active:scale-95 ${
                  activo ? 'bg-foreground text-background' : 'bg-card shadow-sm hover:bg-secondary'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Con esto acomodamos la app a tu negocio. Un restaurante ve Mesas a la mano.
        </p>
      </div>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}

      <SubmitButton listo={nombre.trim().length >= 2 && tipo.length > 0} />
    </form>
  );
}

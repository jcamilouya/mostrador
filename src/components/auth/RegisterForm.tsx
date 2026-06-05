'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth/actions';
import { Loader2, CheckCircle2 } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full rounded-2xl"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Creando tu cuenta…
        </>
      ) : (
        'Crear mi negocio'
      )}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(signUp, {});

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ingreso)]/15">
          <CheckCircle2 className="h-7 w-7 text-[var(--ingreso)]" />
        </div>
        <h2 className="text-xl font-semibold">¡Casi listo!</h2>
        <p className="text-sm text-muted-foreground">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Tu nombre</Label>
        <Input
          id="nombre"
          name="nombre"
          type="text"
          placeholder="¿Cómo te llamas?"
          autoComplete="name"
          required
          className="rounded-xl h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          required
          className="rounded-xl h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-xl h-11"
        />
      </div>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

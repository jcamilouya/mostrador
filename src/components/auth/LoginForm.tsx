'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth/actions';
import { Loader2 } from 'lucide-react';

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
          Entrando…
        </>
      ) : (
        'Entrar a mi negocio'
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
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
          autoComplete="current-password"
          required
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
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Crea tu negocio gratis
        </Link>
      </p>
    </form>
  );
}

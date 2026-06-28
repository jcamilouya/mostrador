import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutoRedirect } from './AutoRedirect';

export const metadata: Metadata = {
  title: 'Correo confirmado — Mostrador',
};

export default async function ConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const hayError = sp.error === '1';
  // Solo permitimos rutas internas como destino (evita open-redirect).
  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/onboarding';

  if (hayError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--egreso)]/15">
            <AlertCircle className="h-7 w-7 text-[var(--egreso)]" />
          </div>
          <h1 className="text-xl font-semibold">No pudimos confirmar el enlace</h1>
          <p className="text-sm text-muted-foreground">
            El enlace pudo haber vencido o ya fue usado. Si ya confirmaste antes,
            simplemente inicia sesión con tu correo y contraseña.
          </p>
          <Link href="/login" className="block">
            <Button size="lg" className="w-full rounded-2xl">
              Ir a iniciar sesión
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <AutoRedirect next={next} />
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ingreso)]/15">
          <CheckCircle2 className="h-7 w-7 text-[var(--ingreso)]" />
        </div>
        <h1 className="text-xl font-semibold">¡Correo confirmado! 🎉</h1>
        <p className="text-sm text-muted-foreground">
          Tu cuenta quedó verificada. Te estamos llevando a Mostrador…
        </p>
        <Link href={next} className="block">
          <Button size="lg" className="w-full rounded-2xl">
            Entrar a Mostrador
          </Button>
        </Link>
      </div>
    </main>
  );
}

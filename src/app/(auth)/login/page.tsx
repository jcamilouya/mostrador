import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Entrar — Mostrador',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl">Bienvenido de vuelta</CardTitle>
        <CardDescription>Entra para ver cómo va tu negocio hoy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error === 'callback' && (
          <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
            No pudimos confirmar tu sesión. Intenta de nuevo.
          </p>
        )}
        {error === 'oauth' && (
          <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
            Hubo un problema con Google. Intenta con email y contraseña.
          </p>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  );
}

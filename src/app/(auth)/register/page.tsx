import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Crear cuenta — Mostrador',
};

export default function RegisterPage() {
  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl">Crea tu negocio en Mostrador</CardTitle>
        <CardDescription>
          Es gratis los primeros 30 días. Sin tarjeta, sin compromisos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  );
}

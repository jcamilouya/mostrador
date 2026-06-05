import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { ClienteForm } from '@/components/clientes/ClienteForm';
import { crearClienteForm } from '@/lib/clientes/actions';

export const metadata: Metadata = {
  title: 'Nuevo cliente — Mostrador',
};

export default async function NuevoClientePage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo cliente</h1>
        <p className="text-sm text-muted-foreground">Solo el nombre es obligatorio.</p>
      </header>

      <ClienteForm action={crearClienteForm} />
    </div>
  );
}

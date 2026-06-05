import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getClientes } from '@/lib/clientes/queries';
import { ClientesLista } from '@/components/clientes/ClientesLista';

export const metadata: Metadata = {
  title: 'Clientes — Mostrador',
};

export default async function ClientesPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const clientes = await getClientes(empresaId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Users className="h-7 w-7" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Tus clientes y su historial de compras.
          </p>
        </div>
        <Link href="/dashboard/clientes/nuevo">
          <Button size="lg" className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </Link>
      </header>

      <ClientesLista clientes={clientes} />
    </div>
  );
}

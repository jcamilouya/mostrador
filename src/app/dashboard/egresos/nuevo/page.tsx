import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { crearEgreso } from '@/lib/egresos/actions';

export const metadata: Metadata = {
  title: 'Nuevo gasto — Mostrador',
};

export default async function NuevoEgresoPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Registrar gasto</h1>
        <p className="text-sm text-muted-foreground">
          Lo descontamos de tus ingresos para mostrarte cuánto ganaste de verdad.
        </p>
      </header>

      <ExpenseForm action={crearEgreso} />
    </div>
  );
}

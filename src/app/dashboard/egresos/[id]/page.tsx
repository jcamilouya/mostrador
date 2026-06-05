import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { DeleteExpenseButton } from '@/components/expenses/DeleteExpenseButton';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getEgreso } from '@/lib/egresos/queries';
import { actualizarEgreso } from '@/lib/egresos/actions';

export const metadata: Metadata = {
  title: 'Editar gasto — Mostrador',
};

export default async function EditarEgresoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const { id } = await params;
  const egreso = await getEgreso(empresaId, id);
  if (!egreso) notFound();

  const bound = actualizarEgreso.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Editar gasto</h1>
          <p className="text-sm text-muted-foreground">
            {egreso.fuente === 'whatsapp_ia'
              ? 'Este gasto se registró desde WhatsApp con IA.'
              : 'Ajusta los datos si te equivocaste.'}
          </p>
        </div>
        <DeleteExpenseButton id={id} />
      </header>

      <ExpenseForm action={bound} egreso={egreso} />
    </div>
  );
}

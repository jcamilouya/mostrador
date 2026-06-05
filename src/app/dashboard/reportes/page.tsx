import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { ReportesPanel } from '@/components/reportes/ReportesPanel';

export const metadata: Metadata = {
  title: 'Reportes — Mostrador',
};

export default async function ReportesPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Descarga tus números para tu contador o para la DIAN.
        </p>
      </header>
      <ReportesPanel />
    </div>
  );
}

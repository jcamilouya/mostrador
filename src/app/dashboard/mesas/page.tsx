import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getCuentasAbiertas } from '@/lib/mesas/queries';
import { MesasManager } from '@/components/mesas/MesasManager';

export const metadata: Metadata = {
  title: 'Mesas — Mostrador',
};

export default async function MesasPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const cuentas = await getCuentasAbiertas(empresaId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Mesas</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas abiertas que todavía no has cobrado. Puedes seguirles agregando y cobrar al
          final.
        </p>
      </header>

      <MesasManager cuentas={cuentas} />
    </div>
  );
}

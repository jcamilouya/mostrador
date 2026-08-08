import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getInsumos, getVinculosBebidas } from '@/lib/insumos/queries';
import { InsumosManager } from '@/components/insumos/InsumosManager';

export const metadata: Metadata = {
  title: 'Inventario — Mostrador',
};

export default async function InsumosPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const [insumos, vinculos] = await Promise.all([
    getInsumos(empresaId),
    getVinculosBebidas(empresaId),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground">
          Materia prima, bebidas, confitería y activos. La materia prima se descuenta sola al
          vender productos con receta.
        </p>
      </header>

      <InsumosManager insumos={insumos} vinculos={vinculos} />
    </div>
  );
}

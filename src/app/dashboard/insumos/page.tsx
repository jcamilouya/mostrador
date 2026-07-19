import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getInsumos } from '@/lib/insumos/queries';
import { InsumosManager } from '@/components/insumos/InsumosManager';

export const metadata: Metadata = {
  title: 'Ingredientes — Mostrador',
};

export default async function InsumosPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const insumos = await getInsumos(empresaId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Ingredientes</h1>
        <p className="text-sm text-muted-foreground">
          Controla la materia prima (pan, carne, tomate…). Al vender un producto con receta, se
          descuenta sola.
        </p>
      </header>

      <InsumosManager insumos={insumos} />
    </div>
  );
}

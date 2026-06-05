import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProductForm } from '@/components/inventory/ProductForm';
import { getCategorias, getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { crearProducto } from '@/lib/inventario/actions';

export const metadata: Metadata = {
  title: 'Nuevo producto — Mostrador',
};

export default async function NuevoProductoPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const categorias = await getCategorias(empresaId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">
          Llena los datos. Lo que pongas aquí va a aparecer en el POS.
        </p>
      </header>

      <ProductForm action={crearProducto} categorias={categorias} />
    </div>
  );
}

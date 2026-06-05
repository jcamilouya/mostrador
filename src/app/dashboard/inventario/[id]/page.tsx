import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { ProductForm } from '@/components/inventory/ProductForm';
import { ArchiveActions } from '@/components/inventory/ArchiveActions';
import {
  getCategorias,
  getEmpresaIdDelUsuario,
  getProducto,
} from '@/lib/inventario/queries';
import { actualizarProducto } from '@/lib/inventario/actions';

export const metadata: Metadata = {
  title: 'Editar producto — Mostrador',
};

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const { id } = await params;
  const [producto, categorias] = await Promise.all([
    getProducto(empresaId, id),
    getCategorias(empresaId),
  ]);

  if (!producto) notFound();

  const accionBindeada = actualizarProducto.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{producto.nombre}</h1>
          <p className="text-sm text-muted-foreground">Edita los datos del producto.</p>
        </div>
        <ArchiveActions id={id} />
      </header>

      <ProductForm
        action={accionBindeada}
        categorias={categorias}
        producto={producto}
      />
    </div>
  );
}

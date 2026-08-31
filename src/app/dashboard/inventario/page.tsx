import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { InventoryList } from '@/components/inventory/InventoryList';
import { AgregarProductos } from '@/components/inventory/AgregarProductos';
import {
  getCategorias,
  getEmpresaIdDelUsuario,
  getProductos,
} from '@/lib/inventario/queries';
import { getResumenRecetas } from '@/lib/insumos/queries';

export const metadata: Metadata = {
  title: 'Productos — Mostrador',
};

export default async function InventarioPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const [productos, categorias, recetas] = await Promise.all([
    getProductos(empresaId),
    getCategorias(empresaId),
    getResumenRecetas(empresaId),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tus productos</h1>
          <p className="text-sm text-muted-foreground">
            {productos.length === 0
              ? 'Carga lo que vendes para empezar a usar el POS.'
              : `${productos.length} productos en tu catálogo.`}
          </p>
        </div>
        <AgregarProductos vacio={productos.length === 0} />
      </header>

      <InventoryList productos={productos} categorias={categorias} recetas={recetas} />
    </div>
  );
}

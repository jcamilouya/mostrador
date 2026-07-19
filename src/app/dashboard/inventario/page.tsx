import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InventoryList } from '@/components/inventory/InventoryList';
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
        <Link href="/dashboard/inventario/nuevo">
          <Button size="lg" className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" />
            Agregar producto
          </Button>
        </Link>
      </header>

      <InventoryList productos={productos} categorias={categorias} recetas={recetas} />
    </div>
  );
}

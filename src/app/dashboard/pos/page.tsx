import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario, getCategorias } from '@/lib/inventario/queries';
import { getProductosPOS, getVentasHoy } from '@/lib/pos/queries';
import { getBrebConfig } from '@/lib/breb/queries';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { Cart } from '@/components/pos/Cart';
import { VentasHoyList } from '@/components/pos/VentasHoyList';

export const metadata: Metadata = {
  title: 'Vender — Mostrador',
};

export default async function POSPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const [productos, categorias, ventasHoy, breb] = await Promise.all([
    getProductosPOS(empresaId),
    getCategorias(empresaId),
    getVentasHoy(empresaId),
    getBrebConfig(empresaId),
  ]);

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-4rem)] lg:-mx-8 lg:-my-8">
      {/* Panel productos */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-40 lg:px-8 lg:py-8 lg:pb-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Vender</h1>
          <p className="text-sm text-muted-foreground">
            Toca un producto para agregarlo a la venta.
          </p>
        </header>

        <ProductGrid productos={productos} categorias={categorias} />

        <div className="mt-4">
          <VentasHoyList ventas={ventasHoy} />
        </div>
      </div>

      {/* Carrito */}
      <Cart negocio={breb.nombreNegocio} breb={breb} />
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario, getCategorias } from '@/lib/inventario/queries';
import { getProductosPOS, getVentasHoy, getTotalVentasHoy } from '@/lib/pos/queries';
import { getInsumos } from '@/lib/insumos/queries';
import { getBrebConfig } from '@/lib/breb/queries';
import { getSesion } from '@/lib/auth/sesion';
import { GuiaPOS } from '@/components/practica/GuiaPOS';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { Cart } from '@/components/pos/Cart';
import { VentasHoyList } from '@/components/pos/VentasHoyList';

import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Cómo vender',
  puntos: [
    'Toca un producto y se suma a la cuenta. Tócalo otra vez y van dos.',
    'A un lado ves lo que lleva el cliente y el total. Puedes quitar o cambiar cantidades.',
    'Toca Cobrar y elige cómo te pagaron: efectivo, tarjeta, transferencia o Bre-B.',
    'Si el cliente va a seguir pidiendo, usa Guardar en mesa y le cobras al final.',
  ],
};

export const metadata: Metadata = {
  title: 'Vender — Mostrador',
};

export default async function POSPage() {
  const sesion = await getSesion();
  const empresaId = sesion?.empresaId ?? (await getEmpresaIdDelUsuario());
  if (!empresaId) redirect('/onboarding');

  const [productos, categorias, ventasHoy, resumenHoy, breb, insumos] = await Promise.all([
    getProductosPOS(empresaId),
    getCategorias(empresaId),
    getVentasHoy(empresaId),
    getTotalVentasHoy(empresaId),
    getBrebConfig(empresaId),
    getInsumos(empresaId),
  ]);

  const bebidas = insumos
    .filter((i) => i.tipo === 'bebidas')
    .map((i) => ({ id: i.id, nombre: i.nombre, stock: i.stock_actual }));

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-4rem)] lg:-mx-8 lg:-my-8">
      {/* Panel productos */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-6 pb-40 lg:px-8 lg:py-8 lg:pb-8">
        <header>
          <span className="flex items-center gap-1"><h1 className="text-2xl font-semibold tracking-tight">Vender</h1><AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} /></span>
          <p className="text-sm text-muted-foreground">
            Toca un producto para agregarlo a la venta.
          </p>
        </header>

        <ProductGrid productos={productos} categorias={categorias} bebidas={bebidas} />

        {sesion && !sesion.guiaPosVista && productos.length > 0 && <GuiaPOS />}

        <div className="mt-4">
          <VentasHoyList ventas={ventasHoy} totalDia={resumenHoy.total} count={resumenHoy.count} />
        </div>
      </div>

      {/* Carrito */}
      <Cart negocio={breb.nombreNegocio} breb={breb} practica={sesion?.modoPractica === true} />
    </div>
  );
}

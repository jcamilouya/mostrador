import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getCuentasAbiertas } from '@/lib/mesas/queries';
import { getSalon } from '@/lib/salon/queries';
import { MesasManager } from '@/components/mesas/MesasManager';
import { Salon } from '@/components/salon/Salon';
import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Cómo funcionan las mesas',
  puntos: [
    'Cada mesa tiene un color: verde libre, rojo ocupada, amarillo pidieron la cuenta, morado reservada.',
    'Toca una mesa libre y "Tomar pedido": eliges los platos en Vender y tocas "Guardar en la mesa".',
    'Toca una mesa ocupada para ver lo que pidieron, agregarle más o cobrarla.',
    'Nada se descuenta de tu inventario hasta que cobras: si se arrepienten, no queda basura.',
    'Con "Editar plano" acomodas las mesas como están en tu local: zonas, formas, cocina, baños.',
  ],
};

const AYUDA_SIN_PLANO = {
  titulo: 'Cómo funcionan las mesas',
  puntos: [
    'Sirve para pedidos que se cobran al final: el cliente pide, sigue pidiendo y paga cuando se va.',
    'En Vender armas el pedido y tocas "Guardar en mesa" en vez de Cobrar.',
    'La mesa queda abierta aquí. Le puedes seguir agregando todo lo que quiera.',
    'Nada se descuenta de tu inventario hasta que cobras: si se arrepiente, no queda basura.',
  ],
};

export const metadata: Metadata = {
  title: 'Mesas — Mostrador',
};

export default async function MesasPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const [cuentas, salon] = await Promise.all([getCuentasAbiertas(empresaId), getSalon(empresaId)]);
  const ayuda = salon.disponible ? AYUDA : AYUDA_SIN_PLANO;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header>
        <span className="flex items-center gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Mesas</h1>
          <AyudaPantalla titulo={ayuda.titulo} puntos={ayuda.puntos} />
        </span>
        {!salon.disponible && (
          <p className="text-sm text-muted-foreground">
            Cuentas abiertas que todavía no has cobrado. Puedes seguirles agregando y cobrar al
            final.
          </p>
        )}
      </header>

      {salon.disponible ? (
        <Salon
          zonas={salon.zonas}
          piezas={salon.piezas}
          cuentas={cuentas}
          generadoEn={Date.now()}
        />
      ) : (
        <MesasManager cuentas={cuentas} />
      )}
    </div>
  );
}

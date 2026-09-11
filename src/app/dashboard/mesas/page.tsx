import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getCuentasAbiertas } from '@/lib/mesas/queries';
import { MesasManager } from '@/components/mesas/MesasManager';
import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: "Cómo funcionan las mesas",
  puntos: [
    "Sirve para pedidos que se cobran al final: el cliente pide, sigue pidiendo y paga cuando se va.",
    "En Vender armas el pedido y tocas \"Guardar en mesa\" en vez de Cobrar.",
    "La mesa queda abierta aquí. Le puedes seguir agregando todo lo que quiera.",
    "Nada se descuenta de tu inventario hasta que cobras: si se arrepiente, no queda basura.",
  ],
};

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
        <span className="flex items-center gap-1"><h1 className="text-3xl font-semibold tracking-tight">Mesas</h1><AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} /></span>
        <p className="text-sm text-muted-foreground">
          Cuentas abiertas que todavía no has cobrado. Puedes seguirles agregando y cobrar al
          final.
        </p>
      </header>

      <MesasManager cuentas={cuentas} />
    </div>
  );
}

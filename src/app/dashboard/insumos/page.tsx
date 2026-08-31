import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getInsumos, getVinculosBebidas } from '@/lib/insumos/queries';
import { InsumosManager } from '@/components/insumos/InsumosManager';

import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Cómo funcionan tus ingredientes',
  puntos: [
    'Es lo que usas para preparar, y lo que se guarda: carne, pan, gaseosas.',
    'Cuando vendes un plato con receta, sus ingredientes bajan solos.',
    'Si vendes algo tal cual (una cerveza), conéctalo con su producto para llevar un solo stock.',
    'Ponle un mínimo a cada uno y la app te avisa antes de que se acabe.',
  ],
};

export const metadata: Metadata = {
  title: 'Ingredientes — Mostrador',
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
        <span className="flex items-center gap-1"><h1 className="text-3xl font-semibold tracking-tight">Ingredientes</h1><AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} /></span>
        <p className="text-sm text-muted-foreground">
          Materia prima, bebidas, confitería y activos. La materia prima se descuenta sola al
          vender productos con receta.
        </p>
      </header>

      <InsumosManager insumos={insumos} vinculos={vinculos} />
    </div>
  );
}

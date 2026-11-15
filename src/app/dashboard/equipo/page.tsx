import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/sesion';
import { getEquipo } from '@/lib/equipo/queries';
import { aSlug } from '@/lib/carta/slug';
import { EquipoManager } from '@/components/equipo/EquipoManager';
import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Tu equipo',
  puntos: [
    'Crea una cuenta para cada mesero y cajero. Entran con su usuario y contraseña, sin correo.',
    'El mesero ve las mesas, toma pedidos y los marcha a cocina. No ve tus ventas, gastos ni ajustes.',
    'La caja además cobra, maneja clientes y ve los ingresos.',
    'Si alguien deja de trabajar contigo, desactívalo: no podrá entrar más.',
  ],
};

export const metadata: Metadata = { title: 'Equipo — Mostrador' };

export default async function EquipoPage() {
  const sesion = await getSesion();
  if (!sesion?.empresaId) redirect('/onboarding');
  if (sesion.rol !== 'dueno') redirect('/dashboard/mesas');

  const equipo = await getEquipo(sesion.empresaId);
  // Sufijo sugerido para los usuarios: "carlos.sabore".
  const sufijo = aSlug(sesion.empresaNombre).split('-')[0]?.slice(0, 14) || 'equipo';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <span className="flex items-center gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Equipo</h1>
          <AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} />
        </span>
        <p className="text-sm text-muted-foreground">
          Meseros y cajeros que usan Mostrador en tu negocio.
        </p>
      </header>

      {equipo === null ? (
        <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Para crear tu equipo falta correr la migración 023 en Supabase.
        </p>
      ) : (
        <EquipoManager equipo={equipo} sufijo={sufijo} meseroCobra={sesion.meseroCobra} />
      )}
    </div>
  );
}

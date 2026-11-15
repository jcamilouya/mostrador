import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/sesion';
import { getComandas } from '@/lib/comandas/queries';
import { CocinaVista } from '@/components/comandas/CocinaVista';
import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Cómo funciona la cocina',
  puntos: [
    'Cada vez que alguien toca "Marchar", sale una comanda numerada con la mesa, los platos y las notas.',
    'Si quitan algo que ya estaba en cocina, sale una comanda ANULADO en rojo para que no lo preparen.',
    'Marca "Este equipo imprime las comandas" en el computador que tiene la impresora térmica.',
    'Para que imprima sin preguntar cada vez, abre Chrome con la opción --kiosk-printing y deja la térmica como impresora predeterminada.',
    'Sin impresora, deja esta pantalla abierta en una tablet en la cocina: se actualiza sola.',
  ],
};

export const metadata: Metadata = { title: 'Cocina — Mostrador' };

export default async function CocinaPage() {
  const sesion = await getSesion();
  if (!sesion?.empresaId) redirect('/onboarding');

  const comandas = await getComandas(sesion.empresaId);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header>
        <span className="flex items-center gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Cocina</h1>
          <AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} />
        </span>
        <p className="text-sm text-muted-foreground">Lo que se ha mandado a cocina en este turno.</p>
      </header>

      {comandas === null ? (
        <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground shadow-sm">
          Para usar la cocina falta correr la migración 023 en Supabase.
        </p>
      ) : (
        <CocinaVista comandas={comandas} generadoEn={Date.now()} />
      )}
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import type { PuntoBalance } from '@/lib/analitica/queries';

/**
 * El gráfico usa recharts, que es la librería más pesada de la app y estaba
 * entrando en el paquete de la pantalla de inicio — la primera que se abre, y
 * casi siempre desde un celular. Cargándolo aparte, el inicio se pinta sin
 * esperarlo y el gráfico entra un instante después con su propio esqueleto.
 */
const RevenueChart = dynamic(
  () => import('./RevenueChart').then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl bg-card p-5 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-secondary/70" />
        <div className="mt-4 h-56 animate-pulse rounded-2xl bg-secondary/40" />
      </div>
    ),
  },
);

export function RevenueChartLazy({ serie }: { serie: PuntoBalance[] }) {
  return <RevenueChart serie={serie} />;
}

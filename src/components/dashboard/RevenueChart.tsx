'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PuntoBalance } from '@/lib/analitica/queries';
import { formatCOP } from '@/lib/utils/format';

const compacto = new Intl.NumberFormat('es-CO', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function etiquetaFecha(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
  });
}

export function RevenueChart({ serie }: { serie: PuntoBalance[] }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const hayDatos = serie.some((p) => p.ingresos > 0 || p.egresos > 0);

  return (
    <div className="rounded-3xl bg-card p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="font-semibold">Ingresos vs gastos</h2>
        <p className="text-xs text-muted-foreground">Últimos {serie.length} días</p>
      </header>

      {!hayDatos ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Cuando empieces a vender y registrar gastos, vas a ver aquí tu tendencia.
        </p>
      ) : (
        <div className="h-64 w-full min-w-0">
          {montado && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIngreso" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ingreso)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--ingreso)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gEgreso" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--egreso)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--egreso)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={etiquetaFecha}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={(v) => compacto.format(Number(v))}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCOP(Number(value)),
                    name === 'ingresos' ? 'Ingresos' : 'Gastos',
                  ]}
                  labelFormatter={(label) => etiquetaFecha(String(label))}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ingresos"
                  stroke="var(--ingreso)"
                  strokeWidth={2}
                  fill="url(#gIngreso)"
                />
                <Area
                  type="monotone"
                  dataKey="egresos"
                  stroke="var(--egreso)"
                  strokeWidth={2}
                  fill="url(#gEgreso)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--ingreso)]" /> Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--egreso)]" /> Gastos
        </span>
      </div>
    </div>
  );
}

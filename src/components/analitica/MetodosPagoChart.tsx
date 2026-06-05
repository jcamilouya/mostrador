'use client';

import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { MetodoPagoSlice } from '@/lib/analitica/queries';
import { formatCOP } from '@/lib/utils/format';

const ETIQUETA: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

const COLORES: Record<string, string> = {
  efectivo: 'var(--ingreso)',
  breb: 'var(--utilidad)',
  transferencia: 'var(--egreso)',
  mixto: 'var(--muted-foreground)',
};

export function MetodosPagoChart({
  data,
  total,
}: {
  data: MetodoPagoSlice[];
  total: number;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aún no hay ventas en este período.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        {montado && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="metodo"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.metodo} fill={COLORES[d.metodo] ?? 'var(--muted-foreground)'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _n, item) => [
                  formatCOP(Number(value)),
                  ETIQUETA[(item?.payload as MetodoPagoSlice)?.metodo] ?? '',
                ]}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="w-full space-y-2">
        {data.map((d) => {
          const pct = total > 0 ? (d.total / total) * 100 : 0;
          return (
            <li key={d.metodo} className="flex items-center gap-3 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: COLORES[d.metodo] ?? 'var(--muted-foreground)' }}
              />
              <span className="flex-1 truncate">{ETIQUETA[d.metodo] ?? d.metodo}</span>
              <span className="tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
              <span className="w-28 text-right font-medium tabular-nums">
                {formatCOP(d.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

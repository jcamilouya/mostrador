import { Receipt, Clock } from 'lucide-react';
import { formatCOP } from '@/lib/utils/format';
import type { VentaResumen } from '@/lib/pos/queries';
import { ConfirmarBrebButton } from './ConfirmarBrebButton';

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export function VentasHoyList({
  ventas,
  totalDia,
  count,
}: {
  ventas: VentaResumen[];
  // Total y # reales del día (sin el límite de la lista). Si no vienen, se
  // calculan de las filas visibles (compatibilidad).
  totalDia?: number;
  count?: number;
}) {
  if (ventas.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        Aún no has vendido nada hoy. ¡El primer cliente está por llegar!
      </div>
    );
  }

  const total =
    totalDia ??
    ventas.filter((v) => v.estado === 'completada').reduce((acc, v) => acc + v.total, 0);
  const totalCount = count ?? ventas.length;

  return (
    <div className="rounded-2xl bg-card shadow-sm">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Ventas de hoy ({totalCount})</h2>
        </div>
        <p className="text-sm font-semibold tabular-nums text-[var(--ingreso)]">
          {formatCOP(total)}
        </p>
      </header>
      <ul className="divide-y">
        {ventas.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">Venta #{v.numero_venta}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(v.created_at).toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <span>·</span>
                {v.items_count} items
                <span>·</span>
                {METODO_LABEL[v.metodo_pago] ?? v.metodo_pago}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatCOP(v.total)}</p>
              {v.estado === 'pendiente' && (
                <ConfirmarBrebButton ventaId={v.id} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

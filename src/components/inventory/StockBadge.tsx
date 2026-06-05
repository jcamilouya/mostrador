import { AlertTriangle } from 'lucide-react';

export function StockBadge({
  actual,
  minimo,
}: {
  actual: number;
  minimo: number;
}) {
  const bajo = actual <= minimo;
  const agotado = actual === 0;

  if (agotado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--egreso)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--egreso)]">
        <AlertTriangle className="h-3 w-3" />
        Agotado
      </span>
    );
  }

  if (bajo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--utilidad)]/20 px-2.5 py-0.5 text-xs font-medium text-[var(--utilidad)]">
        <AlertTriangle className="h-3 w-3" />
        Stock bajo · {actual}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {actual} en stock
    </span>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCOP } from '@/lib/utils/format';
import type { IngresoRow, RangoIngresos } from '@/lib/ingresos/queries';
import { VentaDetalleModal } from './VentaDetalleModal';

const METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto',
};

const RANGOS: { value: RangoIngresos; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'mes', label: 'Este mes' },
];

function hrefCon(rango: RangoIngresos, page: number) {
  const params = new URLSearchParams({ rango, page: String(page) });
  return `/dashboard/ingresos?${params.toString()}`;
}

export function IngresosTabla({
  rows,
  negocio,
  rango,
  page,
  totalPaginas,
  totalRegistros,
}: {
  rows: IngresoRow[];
  negocio: string;
  rango: RangoIngresos;
  page: number;
  totalPaginas: number;
  totalRegistros: number;
}) {
  const [ventaId, setVentaId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function abrir(id: string) {
    setVentaId(id);
    setOpen(true);
  }

  return (
    <>
      {/* Filtro de rango */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGOS.map((r) => (
          <Link
            key={r.value}
            href={hrefCon(r.value, 1)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              r.value === rango
                ? 'bg-foreground text-background'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-card px-4 py-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No hay ventas en este período.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-3xl bg-card shadow-sm">
            {rows.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => abrir(v.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">Venta #{v.numero_venta}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at).toLocaleString('es-CO', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>·</span>
                      <span>{v.items_count} items</span>
                      <span>·</span>
                      <span>{METODO[v.metodo_pago] ?? v.metodo_pago}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-semibold tabular-nums ${
                        v.estado === 'cancelada'
                          ? 'text-muted-foreground line-through'
                          : 'text-[var(--ingreso)]'
                      }`}
                    >
                      + {formatCOP(v.total)}
                    </p>
                    {v.estado === 'pendiente' && (
                      <p className="text-xs text-[var(--utilidad)]">Pendiente</p>
                    )}
                    {v.estado === 'cancelada' && (
                      <p className="text-xs text-[var(--egreso)]">Anulada</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Paginación */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">
              {totalRegistros} ventas · Página {page} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <PagBtn
                href={hrefCon(rango, page - 1)}
                disabled={page <= 1}
                aria-label="Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </PagBtn>
              <PagBtn
                href={hrefCon(rango, page + 1)}
                disabled={page >= totalPaginas}
                aria-label="Siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </PagBtn>
            </div>
          </div>
        </>
      )}

      <VentaDetalleModal
        ventaId={ventaId}
        negocio={negocio}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PagBtn({
  href,
  disabled,
  children,
  ...rest
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  if (disabled) {
    return (
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-secondary/40 text-muted-foreground/40"
        {...rest}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors hover:bg-secondary"
      {...rest}
    >
      {children}
    </Link>
  );
}

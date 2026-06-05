'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, MessageCircle, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCOP } from '@/lib/utils/format';
import { CATEGORIA_INFO, CATEGORIAS_EGRESO, type CategoriaEgreso } from '@/lib/egresos/schemas';
import type { Egreso, RangoEgresos } from '@/lib/egresos/queries';

const RANGOS: { value: RangoEgresos; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'mes', label: 'Este mes' },
];

function hrefCon(rango: RangoEgresos, page: number) {
  const params = new URLSearchParams({ rango, page: String(page) });
  return `/dashboard/egresos?${params.toString()}`;
}

export function ExpenseList({
  egresos,
  rango = '30d',
  page = 1,
  totalPaginas = 1,
  totalRegistros,
}: {
  egresos: Egreso[];
  rango?: RangoEgresos;
  page?: number;
  totalPaginas?: number;
  totalRegistros?: number;
}) {
  const [filtro, setFiltro] = useState<'todas' | CategoriaEgreso>('todas');

  const filtrados = useMemo(
    () => (filtro === 'todas' ? egresos : egresos.filter((e) => e.categoria === filtro)),
    [egresos, filtro],
  );

  // Filtro de rango de fecha (server-side, via navegación).
  const rangoFilter = (
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
  );

  if (egresos.length === 0) {
    return (
      <div className="space-y-4">
        {rangoFilter}
        <div className="rounded-3xl bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Receipt className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">No hay gastos en este período</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Toma foto a una factura desde WhatsApp o agrégalo a mano. Lo que pongas aquí se descuenta de tus ingresos para mostrarte tu utilidad real.
          </p>
          <Link
            href="/dashboard/egresos/nuevo"
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-foreground px-5 py-2.5 text-sm font-medium text-background"
          >
            Registrar gasto
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rangoFilter}

      {/* Filtros */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip activa={filtro === 'todas'} onClick={() => setFiltro('todas')}>
          Todas ({egresos.length})
        </Chip>
        {CATEGORIAS_EGRESO.map((c) => {
          const count = egresos.filter((e) => e.categoria === c).length;
          if (count === 0) return null;
          const info = CATEGORIA_INFO[c];
          return (
            <Chip
              key={c}
              activa={filtro === c}
              color={info.color}
              onClick={() => setFiltro(c)}
            >
              {info.emoji} {info.label} ({count})
            </Chip>
          );
        })}
      </div>

      {/* Lista */}
      <ul className="space-y-2">
        {filtrados.map((e) => {
          const info = CATEGORIA_INFO[e.categoria];
          return (
            <li key={e.id}>
              <Link
                href={`/dashboard/egresos/${e.id}`}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm transition-colors hover:bg-secondary/40"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${info.color} 18%, transparent)`,
                  }}
                >
                  {info.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.proveedor || info.label}
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>{info.label}</span>
                    <span>·</span>
                    <span>{new Date(e.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                    {e.fuente === 'whatsapp_ia' && (
                      <>
                        <span>·</span>
                        <MessageCircle className="h-3 w-3 text-[var(--ingreso)]" />
                        <span className="text-[var(--ingreso)]">WhatsApp</span>
                      </>
                    )}
                    {e.recurrente && (
                      <>
                        <span>·</span>
                        <RotateCw className="h-3 w-3" />
                        <span>Recurrente</span>
                      </>
                    )}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums text-[var(--egreso)]">
                  − {formatCOP(e.monto)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {totalRegistros ?? egresos.length} gastos · Página {page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <PagBtn href={hrefCon(rango, page - 1)} disabled={page <= 1} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </PagBtn>
            <PagBtn href={hrefCon(rango, page + 1)} disabled={page >= totalPaginas} aria-label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </PagBtn>
          </div>
        </div>
      )}
    </div>
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

function Chip({
  activa,
  color,
  children,
  onClick,
}: {
  activa: boolean;
  color?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
        activa
          ? 'bg-foreground text-background'
          : 'bg-card text-muted-foreground hover:bg-secondary'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

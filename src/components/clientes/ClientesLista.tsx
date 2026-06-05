'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, User, Phone, ChevronRight } from 'lucide-react';
import { formatCOP } from '@/lib/utils/format';
import type { Cliente } from '@/lib/clientes/queries';

export function ClientesLista({ clientes }: { clientes: Cliente[] }) {
  const [query, setQuery] = useState('');

  const filtrados = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(t) ||
        (c.telefono ?? '').toLowerCase().includes(t),
    );
  }, [clientes, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-3xl bg-card px-4 py-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {clientes.length === 0
              ? 'Aún no tienes clientes. Agrégalos al cobrar o desde aquí.'
              : 'Ningún cliente coincide con tu búsqueda.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-3xl bg-card shadow-sm">
          {filtrados.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/clientes/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase">
                  {c.nombre.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.nombre}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.telefono}
                      </span>
                    )}
                    {c.cantidad_compras > 0 && (
                      <span>
                        {c.cantidad_compras} compra{c.cantidad_compras === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {c.total_compras > 0 && (
                    <p className="text-sm font-semibold tabular-nums text-[var(--ingreso)]">
                      {formatCOP(c.total_compras)}
                    </p>
                  )}
                  {c.ultima_compra && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.ultima_compra).toLocaleDateString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

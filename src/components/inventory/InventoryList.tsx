'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, List, Package, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockBadge } from './StockBadge';
import { formatCOP } from '@/lib/utils/format';
import type { Producto, Categoria } from '@/lib/inventario/queries';

type ViewMode = 'tabla' | 'grid';

export function InventoryList({
  productos,
  categorias,
}: {
  productos: Producto[];
  categorias: Categoria[];
}) {
  const [query, setQuery] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [view, setView] = useState<ViewMode>('tabla');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) setView('grid');
  }, []);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) => {
      if (categoriaFiltro !== 'todas') {
        if (categoriaFiltro === 'sin-categoria' && p.categoria_id) return false;
        if (categoriaFiltro !== 'sin-categoria' && p.categoria_id !== categoriaFiltro) return false;
      }
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.codigo_barras ?? '').toLowerCase().includes(q)
      );
    });
  }, [productos, query, categoriaFiltro]);

  const stockBajo = filtrados.filter((p) => p.stock_actual <= p.stock_minimo).length;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU o código de barras…"
            className="rounded-xl pl-9 h-11"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border bg-card p-0.5">
            <button
              onClick={() => setView('tabla')}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                view === 'tabla' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary'
              }`}
              aria-label="Vista tabla"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                view === 'grid' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary'
              }`}
              aria-label="Vista grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chips de categorías — scroll horizontal en mobile, wrap en desktop */}
      <div className="-mx-4 flex gap-2 overflow-x-auto scroll-smooth px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CategoriaChip
          activa={categoriaFiltro === 'todas'}
          onClick={() => setCategoriaFiltro('todas')}
        >
          Todas ({productos.length})
        </CategoriaChip>
        {categorias.map((c) => {
          const count = productos.filter((p) => p.categoria_id === c.id).length;
          return (
            <CategoriaChip
              key={c.id}
              activa={categoriaFiltro === c.id}
              color={c.color}
              onClick={() => setCategoriaFiltro(c.id)}
            >
              {c.nombre} ({count})
            </CategoriaChip>
          );
        })}
      </div>

      {stockBajo > 0 && (
        <div className="rounded-2xl bg-[var(--utilidad)]/10 px-4 py-3 text-sm text-[var(--utilidad)]">
          ⚠ {stockBajo} producto{stockBajo > 1 ? 's' : ''} con stock bajo o agotado. Reponer pronto.
        </div>
      )}

      {filtrados.length === 0 ? (
        <EmptyState hayProductos={productos.length > 0} />
      ) : view === 'tabla' ? (
        <ProductTable productos={filtrados} />
      ) : (
        <ProductGrid productos={filtrados} />
      )}
    </div>
  );
}

function CategoriaChip({
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
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}

function ProductTable({ productos }: { productos: Producto[] }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Producto</th>
            <th className="px-4 py-3 text-left font-medium">Categoría</th>
            <th className="px-4 py-3 text-right font-medium">Precio venta</th>
            <th className="px-4 py-3 text-right font-medium">Margen</th>
            <th className="px-4 py-3 text-left font-medium">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {productos.map((p) => {
            const margen = p.precio_venta - p.precio_compra;
            return (
              <tr key={p.id} className="hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/inventario/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.nombre}
                  </Link>
                  {p.sku && (
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.categorias ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.categorias.color }}
                      />
                      {p.categorias.nombre}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCOP(p.precio_venta)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--ingreso)]">
                  {formatCOP(margen)}
                </td>
                <td className="px-4 py-3">
                  <StockBadge actual={p.stock_actual} minimo={p.stock_minimo} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductGrid({ productos }: { productos: Producto[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {productos.map((p) => (
        <Link
          key={p.id}
          href={`/dashboard/inventario/${p.id}`}
          className="group flex flex-col rounded-2xl bg-card p-4 shadow-sm transition-transform hover:scale-[1.02]"
        >
          <div
            className="mb-3 flex aspect-square items-center justify-center rounded-xl"
            style={{
              backgroundColor: p.categorias?.color
                ? `color-mix(in oklch, ${p.categorias.color} 18%, transparent)`
                : 'var(--secondary)',
            }}
          >
            <Package
              className="h-10 w-10"
              style={{ color: p.categorias?.color ?? 'var(--muted-foreground)' }}
            />
          </div>
          <p className="line-clamp-2 font-medium text-sm">{p.nombre}</p>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {formatCOP(p.precio_venta)}
          </p>
          <div className="mt-2">
            <StockBadge actual={p.stock_actual} minimo={p.stock_minimo} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyState({ hayProductos }: { hayProductos: boolean }) {
  return (
    <div className="rounded-3xl bg-card p-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        <Package className="h-7 w-7 text-muted-foreground" />
      </div>
      {hayProductos ? (
        <>
          <h3 className="font-semibold">No encontramos nada con esos filtros</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Prueba con otra palabra o quita el filtro de categoría.
          </p>
        </>
      ) : (
        <>
          <h3 className="font-semibold">Aún no tienes productos cargados</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrega tu primer producto para empezar a vender.
          </p>
          <Link href="/dashboard/inventario/nuevo" className="mt-4 inline-block">
            <Button className="rounded-2xl">Agregar producto</Button>
          </Link>
        </>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Search, Package, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import type { ProductoPOS } from '@/lib/pos/queries';

type CategoriaInfo = { id: string; nombre: string; color: string };

export function ProductGrid({
  productos,
  categorias,
}: {
  productos: ProductoPOS[];
  categorias: CategoriaInfo[];
}) {
  const [query, setQuery] = useState('');
  const [catFiltro, setCatFiltro] = useState<string>('todas');
  const [picker, setPicker] = useState<ProductoPOS | null>(null);
  const add = useCart((s) => s.add);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) => {
      if (catFiltro !== 'todas' && p.categoria_id !== catFiltro) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q);
    });
  }, [productos, query, catFiltro]);

  // Agrega al carrito el producto base o una opción/combo concreta.
  function agregar(p: ProductoPOS, opcion?: { nombre: string; precio: number }) {
    add({
      producto_id: p.id,
      nombre: opcion ? `${p.nombre} · ${opcion.nombre}` : p.nombre,
      variante: opcion ? opcion.nombre : null,
      precio_venta: opcion ? opcion.precio : p.precio_venta,
      precio_compra: p.precio_compra,
      stock_disponible: p.stock_actual,
      categoria_color: p.categoria_color,
    });
  }

  function onTap(p: ProductoPOS) {
    if (p.variantes.length > 0) {
      setPicker(p);
    } else {
      agregar(p);
    }
  }

  // Precio más bajo a mostrar en la tarjeta cuando hay opciones.
  function precioDesde(p: ProductoPOS): number {
    return Math.min(p.precio_venta, ...p.variantes.map((v) => v.precio));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          autoFocus
          className="rounded-2xl pl-10 h-12 text-base"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CatChip activa={catFiltro === 'todas'} onClick={() => setCatFiltro('todas')}>
          Todas
        </CatChip>
        {categorias.map((c) => (
          <CatChip
            key={c.id}
            activa={catFiltro === c.id}
            color={c.color}
            onClick={() => setCatFiltro(c.id)}
          >
            {c.nombre}
          </CatChip>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
          No hay productos con esos filtros.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtrados.map((p) => {
            const agotado = p.stock_actual <= 0;
            const tieneOpciones = p.variantes.length > 0;
            return (
              <button
                key={p.id}
                disabled={agotado}
                onClick={() => onTap(p)}
                className={`group relative flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-3 text-left shadow-sm transition-transform ${
                  agotado ? 'opacity-50' : 'hover:scale-[1.02] active:scale-95'
                }`}
              >
                <div
                  className="relative flex aspect-[5/4] items-center justify-center overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: p.categoria_color
                      ? `color-mix(in oklch, ${p.categoria_color} 18%, transparent)`
                      : 'var(--secondary)',
                  }}
                >
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagen_url}
                      alt={p.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package
                      className="h-8 w-8"
                      style={{ color: p.categoria_color ?? 'var(--muted-foreground)' }}
                    />
                  )}
                  {tieneOpciones && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-medium text-background">
                      <Layers className="h-3 w-3" />
                      {p.variantes.length + 1} opc.
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium leading-tight">{p.nombre}</p>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold tabular-nums">
                    {tieneOpciones && (
                      <span className="mr-1 text-[10px] font-normal text-muted-foreground">desde</span>
                    )}
                    {formatCOP(tieneOpciones ? precioDesde(p) : p.precio_venta)}
                  </p>
                  <span
                    className={`text-[10px] ${
                      agotado
                        ? 'text-[var(--egreso)]'
                        : p.stock_actual <= 5
                          ? 'text-[var(--utilidad)]'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {agotado ? 'Agotado' : `${p.stock_actual} disp.`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selector de opción/combo */}
      <Dialog open={picker !== null} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>{picker?.nombre}</DialogTitle>
          </DialogHeader>
          {picker && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Elige una opción:</p>
              <OpcionButton
                nombre="Sencillo"
                precio={picker.precio_venta}
                onClick={() => {
                  agregar(picker);
                  setPicker(null);
                }}
              />
              {picker.variantes.map((v, idx) => (
                <OpcionButton
                  key={`${v.nombre}-${idx}`}
                  nombre={v.nombre}
                  precio={v.precio}
                  onClick={() => {
                    agregar(picker, v);
                    setPicker(null);
                  }}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpcionButton({
  nombre,
  precio,
  onClick,
}: {
  nombre: string;
  precio: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-sm transition-colors hover:bg-secondary"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{nombre}</span>
      <span className="shrink-0 font-semibold tabular-nums">{formatCOP(precio)}</span>
    </button>
  );
}

function CatChip({
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

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Package, Layers, CupSoda, ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
export type BebidaPOS = { id: string; nombre: string; stock: number };

// Opción elegida en el paso 1 (null = producto "Sencillo").
type OpcionSel = { nombre: string; precio: number; bebida?: boolean } | null;

export function ProductGrid({
  productos,
  categorias,
  bebidas = [],
}: {
  productos: ProductoPOS[];
  categorias: CategoriaInfo[];
  bebidas?: BebidaPOS[];
}) {
  const [query, setQuery] = useState('');
  const [catFiltro, setCatFiltro] = useState<string>('todas');
  const [picker, setPicker] = useState<ProductoPOS | null>(null);
  // Paso "bebida": guarda la opción elegida mientras se escoge la bebida.
  const [pasoBebida, setPasoBebida] = useState<{ opcion: OpcionSel } | null>(null);
  const add = useCart((s) => s.add);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) => {
      if (catFiltro !== 'todas' && p.categoria_id !== catFiltro) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q);
    });
  }, [productos, query, catFiltro]);

  // Agrega al carrito el producto base o una opción/combo, con bebida opcional.
  function agregar(
    p: ProductoPOS,
    opcion?: OpcionSel,
    bebida?: BebidaPOS | null,
  ) {
    const base = opcion ? `${p.nombre} · ${opcion.nombre}` : p.nombre;
    add({
      producto_id: p.id,
      nombre: bebida ? `${base} (${bebida.nombre})` : base,
      variante: opcion ? opcion.nombre : null,
      insumo_extra_id: bebida?.id ?? null,
      precio_venta: opcion ? opcion.precio : p.precio_venta,
      precio_compra: p.precio_compra,
      // Los preparados no tienen tope: se avisa si falta algo, no se bloquea.
      stock_disponible: p.sePrepara ? Number.POSITIVE_INFINITY : p.stock_actual,
      categoria_color: p.categoria_color,
    });
  }

  // Cierra el diálogo y resetea el paso de bebida.
  function cerrarPicker() {
    setPicker(null);
    setPasoBebida(null);
  }

  // Al elegir una opción (o el producto base): si pide bebida y hay bebidas
  // cargadas, pasar al paso 2; si no, agregar directo.
  function elegirOpcion(p: ProductoPOS, opcion: OpcionSel) {
    const pideBebida = opcion ? opcion.bebida === true : p.pide_bebida;
    if (pideBebida && bebidas.length > 0) {
      setPasoBebida({ opcion });
    } else {
      agregar(p, opcion);
      cerrarPicker();
    }
  }

  function onTap(p: ProductoPOS) {
    if (p.variantes.length > 0) {
      setPicker(p);
    } else if (p.pide_bebida && bebidas.length > 0) {
      // Producto sencillo que pide bebida: abrir directo el paso de bebida.
      setPicker(p);
      setPasoBebida({ opcion: null });
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

      {productos.length === 0 ? (
        /* Sin NINGÚN producto cargado: es la primera pantalla de todo dueño
           nuevo. Antes decía "no hay productos con esos filtros" sin filtros
           puestos y sin salida — el peor callejón de la app. */
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-sm">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
            🍽️
          </span>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">Todavía no tienes qué vender</p>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              Carga lo que vendes con su precio y aparecerá aquí para tocarlo y cobrarlo.
            </p>
          </div>
          <Link href="/dashboard/inventario/nuevo">
            <Button size="lg" className="h-12 rounded-2xl gap-2">
              <Plus className="h-4 w-4" /> Agregar mi primer producto
            </Button>
          </Link>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Ningún producto coincide con lo que buscas.
          </p>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => {
              setQuery('');
              setCatFiltro('todas');
            }}
          >
            Ver todos
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtrados.map((p) => {
            // Un producto que se prepara NUNCA se agota por stock propio: su
            // límite son los ingredientes, y ahí solo avisamos.
            const agotado = !p.sePrepara && p.stock_actual <= 0;
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
                  {p.sePrepara ? (
                    <span
                      className={`text-[10px] ${
                        p.faltantes.length > 0
                          ? 'text-[var(--egreso)]'
                          : 'text-muted-foreground'
                      }`}
                      title={
                        p.faltantes.length > 0
                          ? `Sin existencias de: ${p.faltantes.join(', ')}`
                          : 'Se prepara con receta'
                      }
                    >
                      {p.faltantes.length > 0
                        ? `Falta ${p.faltantes[0]}${p.faltantes.length > 1 ? ` +${p.faltantes.length - 1}` : ''}`
                        : 'Se prepara'}
                    </span>
                  ) : (
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
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selector de opción/combo + bebida */}
      <Dialog open={picker !== null} onOpenChange={(o) => !o && cerrarPicker()}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {pasoBebida
                ? `¿Cuál bebida? 🥤`
                : picker?.nombre}
            </DialogTitle>
          </DialogHeader>

          {/* Paso 1: opción/combo */}
          {picker && !pasoBebida && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Elige una opción:</p>
              <OpcionButton
                nombre="Sencillo"
                precio={picker.precio_venta}
                conBebida={picker.pide_bebida && bebidas.length > 0}
                onClick={() => elegirOpcion(picker, null)}
              />
              {picker.variantes.map((v, idx) => (
                <OpcionButton
                  key={`${v.nombre}-${idx}`}
                  nombre={v.nombre}
                  precio={v.precio}
                  conBebida={v.bebida === true && bebidas.length > 0}
                  onClick={() => elegirOpcion(picker, v)}
                />
              ))}
            </div>
          )}

          {/* Paso 2: bebida del Inventario */}
          {picker && pasoBebida && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {pasoBebida.opcion ? `${picker.nombre} · ${pasoBebida.opcion.nombre}` : picker.nombre}
                {' — '}elige la bebida (se descuenta del Inventario):
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {bebidas.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={b.stock <= 0}
                    onClick={() => {
                      agregar(picker, pasoBebida.opcion, b);
                      cerrarPicker();
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-sm transition-colors ${
                      b.stock <= 0 ? 'cursor-not-allowed opacity-50' : 'hover:bg-secondary'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                      <CupSoda className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{b.nombre}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        b.stock <= 0 ? 'text-[var(--egreso)]' : 'text-muted-foreground'
                      }`}
                    >
                      {b.stock <= 0 ? 'Sin stock' : `${b.stock} disp.`}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  agregar(picker, pasoBebida.opcion, null);
                  cerrarPicker();
                }}
                className="w-full rounded-2xl border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
              >
                Sin bebida / otra
              </button>
              <button
                type="button"
                onClick={() => setPasoBebida(null)}
                className="flex w-full items-center justify-center gap-1 pt-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Volver a las opciones
              </button>
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
  conBebida,
  onClick,
}: {
  nombre: string;
  precio: number;
  conBebida?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left shadow-sm transition-colors hover:bg-secondary"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium">
        {nombre}
        {conBebida && <CupSoda className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </span>
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

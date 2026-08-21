import { createClient } from '@/lib/supabase/server';
import { getEmpresaId } from '@/lib/auth/sesion';
import type { VarianteItem } from './schemas';

export type { VarianteItem };

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigo_barras: string | null;
  precio_compra: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  categoria_id: string | null;
  imagen_url: string | null;
  variantes: VarianteItem[];
  pide_bebida: boolean;
  /** Si el producto es una bebida del Inventario (stock único), su insumo. */
  insumo_id: string | null;
  categorias: { nombre: string; color: string } | null;
};

/** Normaliza el JSONB de variantes a un arreglo limpio de { nombre, precio, bebida }. */
export function normalizarVariantes(raw: unknown): VarianteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => ({
      nombre: typeof v?.nombre === 'string' ? v.nombre : '',
      precio: Number(v?.precio) || 0,
      bebida: v?.bebida === true,
    }))
    .filter((v) => v.nombre.trim().length > 0);
}

export type Categoria = {
  id: string;
  nombre: string;
  color: string;
};

/**
 * Empresa del usuario actual. Delega en `getSesion()`, que está cacheado por
 * request: llamarlo desde el layout y desde la página no cuesta dos veces.
 */
export async function getEmpresaIdDelUsuario(): Promise<string | null> {
  return getEmpresaId();
}

export type ProductoStock = {
  id: string;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  precio_venta: number;
  /** Se prepara con receta: no lleva stock propio, no cuenta como "por agotarse". */
  sePrepara: boolean;
};

/**
 * Productos activos con su stock EFECTIVO: si el producto está conectado a un
 * ítem del Inventario (`insumo_id`), manda el stock del insumo — `productos.
 * stock_actual` se queda congelado y mostraría un número viejo. Lo usan el
 * dashboard (alerta de stock bajo) y la analítica.
 */
export async function getProductosConStock(empresaId: string): Promise<ProductoStock[]> {
  const supabase = await createClient();
  const campos = 'id, nombre, stock_actual, stock_minimo, precio_venta';
  const conLink = await supabase
    .from('productos')
    .select(`${campos}, insumo_id`)
    .eq('empresa_id', empresaId)
    .eq('activo', true);
  let filas = conLink.data as Record<string, unknown>[] | null;
  // Sin la migración 012 la columna no existe: reintentar sin ella.
  if (conLink.error) {
    const sinLink = await supabase
      .from('productos')
      .select(campos)
      .eq('empresa_id', empresaId)
      .eq('activo', true);
    filas = sinLink.data as Record<string, unknown>[] | null;
  }
  if (!filas) return [];

  const linkIds = filas
    .map((p) => p.insumo_id as string | null)
    .filter(Boolean) as string[];
  const stockInsumo = new Map<string, number>();
  if (linkIds.length > 0) {
    const { data: ins } = await supabase
      .from('insumos')
      .select('id, stock_actual')
      .eq('empresa_id', empresaId)
      .in('id', linkIds);
    for (const i of ins ?? []) stockInsumo.set(i.id as string, Number(i.stock_actual) || 0);
  }

  // Los productos que se preparan no tienen stock propio que valga la pena
  // vigilar: lo que se vigila son sus ingredientes.
  const { data: conReceta } = await supabase
    .from('producto_receta')
    .select('producto_id')
    .eq('empresa_id', empresaId);
  const recetas = new Set((conReceta ?? []).map((r) => r.producto_id as string));

  return filas.map((p) => {
    const insumoId = p.insumo_id as string | null;
    const linked = insumoId ? stockInsumo.get(insumoId) : undefined;
    return {
      id: p.id as string,
      nombre: p.nombre as string,
      stock_actual: linked !== undefined ? Math.floor(linked) : Number(p.stock_actual) || 0,
      stock_minimo: Number(p.stock_minimo) || 0,
      precio_venta: Number(p.precio_venta) || 0,
      sePrepara: recetas.has(p.id as string),
    };
  });
}

export async function getProductos(empresaId: string): Promise<Producto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias (nombre, color)')
    .eq('empresa_id', empresaId)
    .order('nombre');

  if (error || !data) return [];

  // Productos vinculados a una bebida → mostrar el stock del insumo (fuente única).
  const linkIds = data.map((p) => p.insumo_id).filter(Boolean) as string[];
  const stockInsumo = new Map<string, number>();
  if (linkIds.length > 0) {
    const { data: ins } = await supabase
      .from('insumos')
      .select('id, stock_actual')
      .eq('empresa_id', empresaId)
      .in('id', linkIds);
    for (const i of ins ?? []) stockInsumo.set(i.id as string, Number(i.stock_actual) || 0);
  }

  return data.map((p) => {
    const linked = p.insumo_id ? stockInsumo.get(p.insumo_id) : undefined;
    return {
      ...p,
      precio_compra: Number(p.precio_compra),
      precio_venta: Number(p.precio_venta),
      stock_actual: linked !== undefined ? Math.floor(linked) : p.stock_actual,
      variantes: normalizarVariantes(p.variantes),
      pide_bebida: p.pide_bebida === true,
      insumo_id: p.insumo_id ?? null,
      categorias: Array.isArray(p.categorias) ? p.categorias[0] ?? null : p.categorias,
    };
  }) as Producto[];
}

export async function getProducto(empresaId: string, id: string): Promise<Producto | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('productos')
    .select('*, categorias (nombre, color)')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    precio_compra: Number(data.precio_compra),
    precio_venta: Number(data.precio_venta),
    variantes: normalizarVariantes(data.variantes),
    pide_bebida: data.pide_bebida === true,
    insumo_id: data.insumo_id ?? null,
    categorias: Array.isArray(data.categorias) ? data.categorias[0] ?? null : data.categorias,
  } as Producto;
}

export async function getCategorias(empresaId: string): Promise<Categoria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, color')
    .eq('empresa_id', empresaId)
    .order('nombre');
  if (error || !data) return [];
  return data as Categoria[];
}

import { createClient } from '@/lib/supabase/server';

export type Insumo = {
  id: string;
  nombre: string;
  tipo: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario: number;
  activo: boolean;
};

export type InsumoConAlerta = Insumo & { bajo: boolean };

/** True si el insumo está en o por debajo de su mínimo (y tiene mínimo definido). */
export function estaBajo(i: { stock_actual: number; stock_minimo: number }): boolean {
  return i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo;
}

function normalizar(row: Record<string, unknown>): Insumo {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    tipo: (row.tipo as string) ?? 'materia_prima',
    unidad: (row.unidad as string) ?? 'unidad',
    stock_actual: Number(row.stock_actual) || 0,
    stock_minimo: Number(row.stock_minimo) || 0,
    costo_unitario: Number(row.costo_unitario) || 0,
    activo: row.activo !== false,
  };
}

export async function getInsumos(empresaId: string): Promise<InsumoConAlerta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('insumos')
    .select('id, nombre, tipo, unidad, stock_actual, stock_minimo, costo_unitario, activo')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre');
  return (data ?? []).map((r) => {
    const i = normalizar(r);
    return { ...i, bajo: estaBajo(i) };
  });
}

export async function getInsumo(empresaId: string, id: string): Promise<Insumo | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('insumos')
    .select('id, nombre, tipo, unidad, stock_actual, stock_minimo, costo_unitario, activo')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  return data ? normalizar(data) : null;
}

/** Cuántos insumos están en o bajo el mínimo — para la alerta del dashboard. */
export async function contarInsumosBajos(empresaId: string): Promise<number> {
  const insumos = await getInsumos(empresaId);
  return insumos.filter((i) => i.bajo).length;
}

/** Normaliza un nombre para comparar (sin tildes, sin mayúsculas, sin dobles espacios). */
function claveNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type VinculoBebida = {
  /** Producto del POS ya conectado a este insumo (stock único). */
  conectado: { id: string; nombre: string } | null;
  /** Producto del POS con el mismo nombre pero SIN conectar (stock duplicado). */
  sugerido: { id: string; nombre: string; stock: number } | null;
};

/**
 * Para cada insumo: si ya tiene un producto del POS conectado (`productos.insumo_id`)
 * o si existe uno con el mismo nombre sin conectar. Ese segundo caso es el que
 * hace que vender no descuente el Inventario: son dos stocks separados del mismo
 * artículo. Devuelve `{}` si aún no existe la columna (migración 012 sin correr).
 */
export async function getVinculosBebidas(
  empresaId: string,
): Promise<Record<string, VinculoBebida>> {
  const supabase = await createClient();
  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, nombre, stock_actual, insumo_id, activo')
    .eq('empresa_id', empresaId);
  if (error || !productos) return {};

  const { data: insumos } = await supabase
    .from('insumos')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('activo', true);

  // Productos sin conectar, indexados por nombre normalizado.
  const porNombre = new Map<string, { id: string; nombre: string; stock: number }>();
  const conectadoPorInsumo = new Map<string, { id: string; nombre: string }>();
  for (const p of productos) {
    const insumoId = (p as Record<string, unknown>).insumo_id as string | null;
    if (insumoId) {
      conectadoPorInsumo.set(insumoId, { id: p.id as string, nombre: p.nombre as string });
    } else if (p.activo !== false) {
      const k = claveNombre(p.nombre as string);
      if (!porNombre.has(k)) {
        porNombre.set(k, {
          id: p.id as string,
          nombre: p.nombre as string,
          stock: Number(p.stock_actual) || 0,
        });
      }
    }
  }

  const map: Record<string, VinculoBebida> = {};
  for (const i of insumos ?? []) {
    const id = i.id as string;
    const conectado = conectadoPorInsumo.get(id) ?? null;
    map[id] = {
      conectado,
      sugerido: conectado ? null : porNombre.get(claveNombre(i.nombre as string)) ?? null,
    };
  }
  return map;
}

export type RecetaItem = {
  insumo_id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  stock_actual: number;
};

/** Receta de un producto (para editarla y para mostrarla). */
export async function getRecetaDeProducto(
  empresaId: string,
  productoId: string,
): Promise<RecetaItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('producto_receta')
    .select('cantidad, insumo_id, insumos ( nombre, unidad, stock_actual )')
    .eq('empresa_id', empresaId)
    .eq('producto_id', productoId);

  return (data ?? []).map((r) => {
    const ins = (r as Record<string, unknown>).insumos as Record<string, unknown> | null;
    return {
      insumo_id: r.insumo_id as string,
      nombre: (ins?.nombre as string) ?? 'Insumo',
      unidad: (ins?.unidad as string) ?? 'unidad',
      cantidad: Number(r.cantidad) || 0,
      stock_actual: Number(ins?.stock_actual) || 0,
    };
  });
}

/** Un ingrediente de la receta que ya no alcanza para preparar 1 unidad. */
export type IngredienteFaltante = {
  nombre: string;
  unidad: string;
  /** Cuánto pide la receta para 1 unidad. */
  necesita: number;
  /** Cuánto queda en el inventario. */
  stock: number;
};

export type ResumenReceta = {
  /** Costo real de 1 unidad del producto = Σ(cantidad × costo del insumo). */
  costoReceta: number;
  /** Ingredientes que ya no alcanzan ni para una. Vacío = se puede preparar. */
  faltantes: IngredienteFaltante[];
};

/**
 * Para todos los productos con receta: costo real por unidad + qué ingredientes
 * se acabaron. Los productos sin receta no aparecen (por eso sirve además para
 * saber si un producto se prepara o se vende tal cual).
 * Devuelve `{}` si aún no existe la tabla (seguro antes de correr la migración).
 */
export async function getResumenRecetas(
  empresaId: string,
): Promise<Record<string, ResumenReceta>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('producto_receta')
    .select('producto_id, cantidad, insumos ( nombre, unidad, costo_unitario, stock_actual )')
    .eq('empresa_id', empresaId);

  const map: Record<string, ResumenReceta> = {};
  for (const r of data ?? []) {
    const ins = (r as Record<string, unknown>).insumos as Record<string, unknown> | null;
    const cantidad = Number(r.cantidad) || 0;
    const costo = Number(ins?.costo_unitario) || 0;
    const stock = Number(ins?.stock_actual) || 0;
    const pid = r.producto_id as string;

    const cur = map[pid] ?? { costoReceta: 0, faltantes: [] };
    cur.costoReceta += cantidad * costo;
    if (cantidad > 0 && stock < cantidad) {
      cur.faltantes.push({
        nombre: (ins?.nombre as string) ?? 'Ingrediente',
        unidad: (ins?.unidad as string) ?? 'unidad',
        necesita: cantidad,
        stock,
      });
    }
    map[pid] = cur;
  }
  return map;
}

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

export type ResumenReceta = {
  /** Costo real de 1 unidad del producto = Σ(cantidad × costo del insumo). */
  costoReceta: number;
  /** Cuántas unidades del producto alcanzan con el stock de ingredientes (min). */
  disponibles: number | null;
};

/**
 * Para todos los productos con receta: costo real por unidad + cuántas se pueden
 * hacer con el stock actual de ingredientes. Los productos sin receta no aparecen.
 * Devuelve `{}` si aún no existe la tabla (seguro antes de correr la migración).
 */
export async function getResumenRecetas(
  empresaId: string,
): Promise<Record<string, ResumenReceta>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('producto_receta')
    .select('producto_id, cantidad, insumos ( costo_unitario, stock_actual )')
    .eq('empresa_id', empresaId);

  const map: Record<string, ResumenReceta> = {};
  for (const r of data ?? []) {
    const ins = (r as Record<string, unknown>).insumos as Record<string, unknown> | null;
    const cantidad = Number(r.cantidad) || 0;
    const costo = Number(ins?.costo_unitario) || 0;
    const stock = Number(ins?.stock_actual) || 0;
    const pid = r.producto_id as string;

    const cur = map[pid] ?? { costoReceta: 0, disponibles: null };
    cur.costoReceta += cantidad * costo;
    if (cantidad > 0) {
      const puede = Math.floor(stock / cantidad);
      cur.disponibles = cur.disponibles === null ? puede : Math.min(cur.disponibles, puede);
    }
    map[pid] = cur;
  }
  return map;
}

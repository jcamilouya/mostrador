import { createClient } from '@/lib/supabase/server';

export type Insumo = {
  id: string;
  nombre: string;
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
    .select('id, nombre, unidad, stock_actual, stock_minimo, costo_unitario, activo')
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
    .select('id, nombre, unidad, stock_actual, stock_minimo, costo_unitario, activo')
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

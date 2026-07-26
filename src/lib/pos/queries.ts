import { createClient } from '@/lib/supabase/server';
import { normalizarVariantes, type VarianteItem } from '@/lib/inventario/queries';
import { inicioDiaBogotaISO, finDiaBogotaISO } from '@/lib/utils/fecha';

export type ProductoPOS = {
  id: string;
  nombre: string;
  precio_venta: number;
  precio_compra: number;
  stock_actual: number;
  imagen_url: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  variantes: VarianteItem[];
  pide_bebida: boolean;
};

export type VentaResumen = {
  id: string;
  numero_venta: number;
  total: number;
  metodo_pago: string;
  estado: string;
  items_count: number;
  created_at: string;
};

export async function getProductosPOS(empresaId: string): Promise<ProductoPOS[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('productos')
    .select('*, categorias (nombre, color)')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('nombre');
  if (!data) return [];

  // Productos vinculados a una bebida del Inventario → stock = stock del insumo.
  const linkIds = data.map((p) => p.insumo_id).filter(Boolean) as string[];
  const stockInsumo = new Map<string, number>();
  if (linkIds.length > 0) {
    const { data: ins } = await supabase.from('insumos').select('id, stock_actual').in('id', linkIds);
    for (const i of ins ?? []) stockInsumo.set(i.id as string, Number(i.stock_actual) || 0);
  }

  return data.map((p) => {
    const cat = Array.isArray(p.categorias) ? p.categorias[0] ?? null : p.categorias;
    const linked = p.insumo_id ? stockInsumo.get(p.insumo_id) : undefined;
    return {
      id: p.id,
      nombre: p.nombre,
      precio_venta: Number(p.precio_venta),
      precio_compra: Number(p.precio_compra),
      stock_actual: linked !== undefined ? Math.floor(linked) : p.stock_actual,
      imagen_url: p.imagen_url ?? null,
      categoria_id: p.categoria_id,
      categoria_nombre: (cat as { nombre?: string } | null)?.nombre ?? null,
      categoria_color: (cat as { color?: string } | null)?.color ?? null,
      variantes: normalizarVariantes(p.variantes),
      pide_bebida: p.pide_bebida === true,
    };
  });
}

export async function getVentasHoy(empresaId: string): Promise<VentaResumen[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ventas')
    .select('id, numero_venta, total, metodo_pago, estado, created_at, venta_items (id)')
    .eq('empresa_id', empresaId)
    .gte('created_at', inicioDiaBogotaISO())
    .lt('created_at', finDiaBogotaISO())
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data) return [];
  return data.map((v) => ({
    id: v.id,
    numero_venta: v.numero_venta,
    total: Number(v.total),
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    items_count: Array.isArray(v.venta_items) ? v.venta_items.length : 0,
    created_at: v.created_at,
  }));
}

/** Total y # de ventas COMPLETADAS de hoy (sin el límite de 20 de la lista). */
export async function getTotalVentasHoy(
  empresaId: string,
): Promise<{ total: number; count: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ventas')
    .select('total')
    .eq('empresa_id', empresaId)
    .eq('estado', 'completada')
    .gte('created_at', inicioDiaBogotaISO())
    .lt('created_at', finDiaBogotaISO());
  const filas = data ?? [];
  return {
    total: filas.reduce((acc, v) => acc + Number(v.total), 0),
    count: filas.length,
  };
}

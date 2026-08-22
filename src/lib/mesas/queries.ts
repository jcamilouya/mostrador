import { createClient } from '@/lib/supabase/server';

export type LineaCuenta = {
  producto_id: string | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  precio_compra: number;
  insumo_extra_id: string | null;
};

export type CuentaAbierta = {
  id: string;
  numero_venta: number;
  mesa: string;
  total: number;
  abiertaDesde: string;
  items: LineaCuenta[];
};

/**
 * Las cuentas que están abiertas ahora mismo (mesas con pedido sin cobrar).
 * Devuelve `[]` si aún no existe la columna `mesa` (migración 014 sin correr),
 * así que es seguro desplegar antes de correrla.
 */
export async function getCuentasAbiertas(empresaId: string): Promise<CuentaAbierta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ventas')
    .select(
      'id, numero_venta, mesa, total, created_at, venta_items (producto_id, nombre_producto, cantidad, precio_unitario, precio_compra, insumo_extra_id)',
    )
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((v) => ({
    id: v.id as string,
    numero_venta: v.numero_venta as number,
    mesa: ((v as Record<string, unknown>).mesa as string) || `Cuenta #${v.numero_venta}`,
    total: Number(v.total) || 0,
    abiertaDesde: v.created_at as string,
    items: (Array.isArray(v.venta_items) ? v.venta_items : []).map((i) => ({
      producto_id: (i.producto_id as string) ?? null,
      nombre_producto: i.nombre_producto as string,
      cantidad: Number(i.cantidad) || 0,
      precio_unitario: Number(i.precio_unitario) || 0,
      precio_compra: Number(i.precio_compra) || 0,
      insumo_extra_id: (i.insumo_extra_id as string) ?? null,
    })),
  }));
}

/** Cuántas cuentas hay abiertas — para el aviso del POS y del menú. */
export async function contarCuentasAbiertas(empresaId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('ventas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta');
  if (error) return 0;
  return count ?? 0;
}

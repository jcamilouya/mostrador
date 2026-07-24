import { createClient } from '@/lib/supabase/server';
import { normalizarVariantes, type VarianteItem } from '@/lib/inventario/queries';

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
  return data.map((p) => {
    const cat = Array.isArray(p.categorias) ? p.categorias[0] ?? null : p.categorias;
    return {
      id: p.id,
      nombre: p.nombre,
      precio_venta: Number(p.precio_venta),
      precio_compra: Number(p.precio_compra),
      stock_actual: p.stock_actual,
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
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('ventas')
    .select('id, numero_venta, total, metodo_pago, estado, created_at, venta_items (id)')
    .eq('empresa_id', empresaId)
    .gte('created_at', hoy.toISOString())
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

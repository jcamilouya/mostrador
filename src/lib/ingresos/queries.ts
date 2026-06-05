import { createClient } from '@/lib/supabase/server';

export type IngresoRow = {
  id: string;
  numero_venta: number;
  total: number;
  metodo_pago: string;
  estado: string;
  items_count: number;
  created_at: string;
};

export type IngresosData = {
  rows: IngresoRow[];
  totalCompletado: number;
  countCompletado: number;
  totalPendiente: number;
  ticketPromedio: number;
  dias: number;
};

export async function getIngresos(empresaId: string, dias = 30): Promise<IngresosData> {
  const supabase = await createClient();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data } = await supabase
    .from('ventas')
    .select('id, numero_venta, total, metodo_pago, estado, created_at, venta_items (id)')
    .eq('empresa_id', empresaId)
    .gte('created_at', desde.toISOString())
    .order('created_at', { ascending: false })
    .limit(200);

  const rows: IngresoRow[] = (data ?? []).map((v) => ({
    id: v.id,
    numero_venta: v.numero_venta,
    total: Number(v.total),
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    items_count: Array.isArray(v.venta_items) ? v.venta_items.length : 0,
    created_at: v.created_at,
  }));

  const completadas = rows.filter((r) => r.estado === 'completada');
  const totalCompletado = completadas.reduce((a, r) => a + r.total, 0);
  const totalPendiente = rows
    .filter((r) => r.estado === 'pendiente')
    .reduce((a, r) => a + r.total, 0);

  return {
    rows,
    totalCompletado,
    countCompletado: completadas.length,
    totalPendiente,
    ticketPromedio: completadas.length > 0 ? totalCompletado / completadas.length : 0,
    dias,
  };
}

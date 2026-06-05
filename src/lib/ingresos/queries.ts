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

export type RangoIngresos = '7d' | '30d' | 'mes';

export type IngresosData = {
  rows: IngresoRow[];
  totalCompletado: number;
  countCompletado: number;
  totalPendiente: number;
  ticketPromedio: number;
  rango: RangoIngresos;
  page: number;
  pageSize: number;
  totalRegistros: number;
  totalPaginas: number;
};

export const PAGE_SIZE_INGRESOS = 20;

/** Fecha ISO de inicio según el rango seleccionado. */
function desdePorRango(rango: RangoIngresos): string {
  const ahora = new Date();
  if (rango === 'mes') {
    return new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  }
  const dias = rango === '7d' ? 7 : 30;
  const d = new Date(ahora);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

export async function getIngresos(
  empresaId: string,
  opts: { rango?: RangoIngresos; page?: number } = {},
): Promise<IngresosData> {
  const rango = opts.rango ?? '30d';
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = PAGE_SIZE_INGRESOS;
  const desde = desdePorRango(rango);

  const supabase = await createClient();

  // Página de filas (con count exacto del total filtrado para la paginación).
  const { data, count } = await supabase
    .from('ventas')
    .select(
      'id, numero_venta, total, metodo_pago, estado, created_at, venta_items (id)',
      { count: 'exact' },
    )
    .eq('empresa_id', empresaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const rows: IngresoRow[] = (data ?? []).map((v) => ({
    id: v.id,
    numero_venta: v.numero_venta,
    total: Number(v.total),
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    items_count: Array.isArray(v.venta_items) ? v.venta_items.length : 0,
    created_at: v.created_at,
  }));

  // Agregados sobre TODO el rango filtrado (no solo la página actual).
  const { data: agg } = await supabase
    .from('ventas')
    .select('total, estado')
    .eq('empresa_id', empresaId)
    .gte('created_at', desde);

  let totalCompletado = 0;
  let countCompletado = 0;
  let totalPendiente = 0;
  for (const v of agg ?? []) {
    const total = Number(v.total) || 0;
    if (v.estado === 'completada') {
      totalCompletado += total;
      countCompletado++;
    } else if (v.estado === 'pendiente') {
      totalPendiente += total;
    }
  }

  const totalRegistros = count ?? rows.length;

  return {
    rows,
    totalCompletado,
    countCompletado,
    totalPendiente,
    ticketPromedio: countCompletado > 0 ? totalCompletado / countCompletado : 0,
    rango,
    page,
    pageSize,
    totalRegistros,
    totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
  };
}

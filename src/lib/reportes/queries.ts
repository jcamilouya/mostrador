import { createClient } from '@/lib/supabase/server';

export type TipoReporte = 'ventas' | 'egresos' | 'pyl';
export type FormatoReporte = 'pdf' | 'xlsx';

export type VentaReporte = {
  numero_venta: number;
  fecha: string;
  metodo_pago: string;
  estado: string;
  total: number;
};

export type EgresoReporte = {
  fecha: string;
  categoria: string;
  proveedor: string | null;
  descripcion: string | null;
  monto: number;
};

export type ReporteData = {
  empresaNombre: string;
  desde: string;
  hasta: string;
  ventas: VentaReporte[];
  ventasPorMetodo: { metodo: string; total: number; count: number }[];
  totalVentas: number;
  egresos: EgresoReporte[];
  egresosPorCategoria: { categoria: string; total: number; count: number }[];
  totalEgresos: number;
  costoMercancia: number;
};

export async function getReporteData(
  empresaId: string,
  desde: string, // YYYY-MM-DD
  hasta: string, // YYYY-MM-DD (inclusive)
): Promise<ReporteData> {
  const supabase = await createClient();

  const desdeISO = new Date(`${desde}T00:00:00`).toISOString();
  const hastaISO = new Date(`${hasta}T23:59:59`).toISOString();

  const [empresaRes, ventasRes, itemsRes, egresosRes] = await Promise.all([
    supabase.from('empresas').select('nombre').eq('id', empresaId).maybeSingle(),
    supabase
      .from('ventas')
      .select('numero_venta, created_at, metodo_pago, estado, total')
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .gte('created_at', desdeISO)
      .lte('created_at', hastaISO)
      .order('created_at', { ascending: true }),
    supabase
      .from('venta_items')
      .select('cantidad, precio_compra, ventas!inner(empresa_id, estado, created_at)')
      .eq('ventas.empresa_id', empresaId)
      .eq('ventas.estado', 'completada')
      .gte('ventas.created_at', desdeISO)
      .lte('ventas.created_at', hastaISO),
    supabase
      .from('egresos')
      .select('fecha, categoria, proveedor, descripcion, monto')
      .eq('empresa_id', empresaId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
  ]);

  const ventas: VentaReporte[] = (ventasRes.data ?? []).map((v) => ({
    numero_venta: v.numero_venta,
    fecha: v.created_at,
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    total: Number(v.total),
  }));

  const metodoMap = new Map<string, { metodo: string; total: number; count: number }>();
  let totalVentas = 0;
  for (const v of ventas) {
    totalVentas += v.total;
    const m = metodoMap.get(v.metodo_pago) ?? { metodo: v.metodo_pago, total: 0, count: 0 };
    m.total += v.total;
    m.count += 1;
    metodoMap.set(v.metodo_pago, m);
  }

  const costoMercancia = (itemsRes.data ?? []).reduce(
    (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_compra) || 0),
    0,
  );

  const egresos: EgresoReporte[] = (egresosRes.data ?? []).map((e) => ({
    fecha: e.fecha,
    categoria: e.categoria,
    proveedor: e.proveedor,
    descripcion: e.descripcion,
    monto: Number(e.monto),
  }));

  const catMap = new Map<string, { categoria: string; total: number; count: number }>();
  let totalEgresos = 0;
  for (const e of egresos) {
    totalEgresos += e.monto;
    const c = catMap.get(e.categoria) ?? { categoria: e.categoria, total: 0, count: 0 };
    c.total += e.monto;
    c.count += 1;
    catMap.set(e.categoria, c);
  }

  return {
    empresaNombre: empresaRes.data?.nombre ?? 'Mi negocio',
    desde,
    hasta,
    ventas,
    ventasPorMetodo: [...metodoMap.values()].sort((a, b) => b.total - a.total),
    totalVentas,
    egresos,
    egresosPorCategoria: [...catMap.values()].sort((a, b) => b.total - a.total),
    totalEgresos,
    costoMercancia,
  };
}

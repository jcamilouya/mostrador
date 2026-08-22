import { createClient } from '@/lib/supabase/server';
import { getProductosConStock } from '@/lib/inventario/queries';
import { hoyBogota, inicioDiaBogotaISO, finDiaBogotaISO } from '@/lib/utils/fecha';

export type DashboardStats = {
  ventasHoyTotal: number;
  ventasHoyCount: number;
  egresosHoyTotal: number;
  egresosHoyCount: number;
  utilidadHoy: number;
  ticketPromedio: number;
  ultimasVentas: {
    id: string;
    numero_venta: number;
    total: number;
    metodo_pago: string;
    created_at: string;
  }[];
  productosStockBajo: number;
};

export async function getDashboardStats(empresaId: string): Promise<DashboardStats> {
  const supabase = await createClient();
  const inicioHoy = inicioDiaBogotaISO();
  const finHoy = finDiaBogotaISO();
  const hoyDate = hoyBogota();

  const [ventasRes, egresosRes, ultimasRes, productosRes] = await Promise.all([
    supabase
      .from('ventas')
      .select('total')
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .gte('created_at', inicioHoy)
      .lt('created_at', finHoy),
    supabase
      .from('egresos')
      .select('monto')
      .eq('empresa_id', empresaId)
      .eq('fecha', hoyDate),
    // Solo lo COBRADO. Una mesa abierta todavía no es plata que entró, y una
    // anulada no entró nunca: ninguna de las dos puede figurar como ingreso.
    supabase
      .from('ventas')
      .select('id, numero_venta, total, metodo_pago, created_at')
      .eq('empresa_id', empresaId)
      .in('estado', ['completada', 'pendiente'])
      .order('created_at', { ascending: false })
      .limit(5),
    // Stock efectivo: las bebidas conectadas cuentan el stock del Inventario.
    getProductosConStock(empresaId),
  ]);

  const ventas = ventasRes.data ?? [];
  const ventasHoyTotal = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const ventasHoyCount = ventas.length;

  const egresos = egresosRes.data ?? [];
  const egresosHoyTotal = egresos.reduce((acc, e) => acc + Number(e.monto), 0);
  const egresosHoyCount = egresos.length;

  const productosStockBajo = productosRes.filter(
    (p) => !p.sePrepara && p.stock_actual <= p.stock_minimo,
  ).length;

  return {
    ventasHoyTotal,
    ventasHoyCount,
    egresosHoyTotal,
    egresosHoyCount,
    utilidadHoy: ventasHoyTotal - egresosHoyTotal,
    ticketPromedio: ventasHoyCount > 0 ? ventasHoyTotal / ventasHoyCount : 0,
    ultimasVentas: (ultimasRes.data ?? []).map((v) => ({
      id: v.id,
      numero_venta: v.numero_venta,
      total: Number(v.total),
      metodo_pago: v.metodo_pago,
      created_at: v.created_at,
    })),
    productosStockBajo,
  };
}

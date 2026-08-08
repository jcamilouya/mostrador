import { createClient } from '@/lib/supabase/server';
import { getProductosConStock } from '@/lib/inventario/queries';

export type PuntoBalance = {
  fecha: string; // YYYY-MM-DD
  ingresos: number;
  egresos: number;
  utilidad: number;
};

export type CeldaHora = {
  dia_semana: number; // 0 = domingo … 6 = sábado
  hora: number; // 0 … 23
  ventas: number;
  monto: number;
};

export type FilaProducto = {
  producto_id: string | null;
  nombre: string;
  unidades: number;
  ingreso: number;
  costo: number;
  margen: number;
  margenPct: number;
};

export type ProductoSinMovimiento = {
  id: string;
  nombre: string;
  stock_actual: number;
  precio_venta: number;
};

export type MetodoPagoSlice = {
  metodo: string;
  total: number;
  count: number;
};

export type ComparativoMes = {
  ingresos: number;
  egresos: number;
  utilidad: number;
  ventasCount: number;
};

export type AnaliticaData = {
  dias: number;
  horas: CeldaHora[];
  topProductos: FilaProducto[];
  margenProductos: FilaProducto[];
  sinMovimiento: ProductoSinMovimiento[];
  metodosPago: MetodoPagoSlice[];
  totalVentasPeriodo: number;
  mesActual: ComparativoMes;
  mesAnterior: ComparativoMes;
};

function inicioDelDia(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Serie diaria ingresos/egresos/utilidad de los últimos `dias`, rellenando
 * los días sin movimiento con ceros para que el gráfico no tenga huecos.
 */
export async function getBalanceDiario(
  empresaId: string,
  dias = 30,
): Promise<PuntoBalance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('balance_diario', {
    p_empresa_id: empresaId,
    p_dias: dias,
  });
  if (error) throw new Error(error.message);

  const porFecha = new Map<string, PuntoBalance>();
  for (const row of data ?? []) {
    const fecha = String(row.fecha).slice(0, 10);
    porFecha.set(fecha, {
      fecha,
      ingresos: Number(row.ingresos) || 0,
      egresos: Number(row.egresos_total) || 0,
      utilidad: Number(row.utilidad) || 0,
    });
  }

  const serie: PuntoBalance[] = [];
  const hoy = inicioDelDia(new Date());
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const fecha = d.toISOString().slice(0, 10);
    serie.push(porFecha.get(fecha) ?? { fecha, ingresos: 0, egresos: 0, utilidad: 0 });
  }
  return serie;
}

function mesComparativo(rangos: {
  ventas: { total: number; created_at: string }[];
  egresos: { monto: number; fecha: string }[];
  desde: Date;
  hasta: Date;
}): ComparativoMes {
  const { ventas, egresos, desde, hasta } = rangos;
  let ingresos = 0;
  let ventasCount = 0;
  for (const v of ventas) {
    const t = new Date(v.created_at);
    if (t >= desde && t < hasta) {
      ingresos += Number(v.total) || 0;
      ventasCount++;
    }
  }
  let eg = 0;
  const desdeF = desde.toISOString().slice(0, 10);
  const hastaF = hasta.toISOString().slice(0, 10);
  for (const e of egresos) {
    if (e.fecha >= desdeF && e.fecha < hastaF) eg += Number(e.monto) || 0;
  }
  return { ingresos, egresos: eg, utilidad: ingresos - eg, ventasCount };
}

export async function getAnaliticaData(
  empresaId: string,
  dias = 30,
): Promise<AnaliticaData> {
  const supabase = await createClient();

  const ahora = new Date();
  const desdePeriodo = new Date(ahora);
  desdePeriodo.setDate(ahora.getDate() - dias);
  const desdePeriodoISO = desdePeriodo.toISOString();

  // Para el comparativo mensual necesitamos el mes actual y el anterior.
  const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const finComparativo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  const [
    horasRes,
    itemsRes,
    productosRes,
    ventasMetodoRes,
    ventasMesRes,
    egresosMesRes,
  ] = await Promise.all([
    supabase.rpc('ventas_por_hora', { p_empresa_id: empresaId, p_dias: dias }),
    // Items vendidos en el período (para top, margen y "sin movimiento").
    supabase
      .from('venta_items')
      .select(
        'producto_id, nombre_producto, cantidad, subtotal, precio_compra, ventas!inner(empresa_id, estado, created_at)',
      )
      .eq('ventas.empresa_id', empresaId)
      .eq('ventas.estado', 'completada')
      .gte('ventas.created_at', desdePeriodoISO),
    // Stock efectivo: las bebidas conectadas cuentan el stock del Inventario.
    getProductosConStock(empresaId),
    supabase
      .from('ventas')
      .select('metodo_pago, total')
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .gte('created_at', desdePeriodoISO),
    // Ventas de los dos meses (actual + anterior) para el comparativo.
    supabase
      .from('ventas')
      .select('total, created_at')
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .gte('created_at', inicioMesAnterior.toISOString())
      .lt('created_at', finComparativo.toISOString()),
    supabase
      .from('egresos')
      .select('monto, fecha')
      .eq('empresa_id', empresaId)
      .gte('fecha', inicioMesAnterior.toISOString().slice(0, 10))
      .lt('fecha', finComparativo.toISOString().slice(0, 10)),
  ]);

  for (const r of [horasRes, itemsRes, ventasMetodoRes, ventasMesRes, egresosMesRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  // Horas pico
  const horas: CeldaHora[] = (horasRes.data ?? []).map((row: Record<string, unknown>) => ({
    dia_semana: Number(row.dia_semana),
    hora: Number(row.hora),
    ventas: Number(row.total_ventas) || 0,
    monto: Number(row.monto_total) || 0,
  }));

  // Agregar items por producto
  const items = (itemsRes.data ?? []) as unknown as {
    producto_id: string | null;
    nombre_producto: string;
    cantidad: number;
    subtotal: number;
    precio_compra: number;
  }[];

  const agg = new Map<string, FilaProducto>();
  const vendidosIds = new Set<string>();
  for (const it of items) {
    if (it.producto_id) vendidosIds.add(it.producto_id);
    const key = it.producto_id ?? `__${it.nombre_producto}`;
    const prev =
      agg.get(key) ??
      {
        producto_id: it.producto_id,
        nombre: it.nombre_producto,
        unidades: 0,
        ingreso: 0,
        costo: 0,
        margen: 0,
        margenPct: 0,
      };
    const cantidad = Number(it.cantidad) || 0;
    const ingreso = Number(it.subtotal) || 0;
    const costo = cantidad * (Number(it.precio_compra) || 0);
    prev.unidades += cantidad;
    prev.ingreso += ingreso;
    prev.costo += costo;
    agg.set(key, prev);
  }
  const filas = [...agg.values()].map((f) => {
    f.margen = f.ingreso - f.costo;
    f.margenPct = f.ingreso > 0 ? (f.margen / f.ingreso) * 100 : 0;
    return f;
  });

  const topProductos = [...filas]
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 10);
  const margenProductos = [...filas]
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 10);

  // Productos sin movimiento en el período
  const sinMovimiento = productosRes
    .filter((p) => !vendidosIds.has(p.id))
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      stock_actual: p.stock_actual,
      precio_venta: p.precio_venta,
    }))
    .sort((a, b) => b.stock_actual - a.stock_actual);

  // Métodos de pago
  const metodoMap = new Map<string, MetodoPagoSlice>();
  let totalVentasPeriodo = 0;
  for (const v of ventasMetodoRes.data ?? []) {
    const metodo = String(v.metodo_pago);
    const total = Number(v.total) || 0;
    totalVentasPeriodo += total;
    const prev = metodoMap.get(metodo) ?? { metodo, total: 0, count: 0 };
    prev.total += total;
    prev.count += 1;
    metodoMap.set(metodo, prev);
  }
  const metodosPago = [...metodoMap.values()].sort((a, b) => b.total - a.total);

  // Comparativo mensual
  const ventasMes = (ventasMesRes.data ?? []) as { total: number; created_at: string }[];
  const egresosMes = (egresosMesRes.data ?? []) as { monto: number; fecha: string }[];
  const mesActual = mesComparativo({
    ventas: ventasMes,
    egresos: egresosMes,
    desde: inicioMesActual,
    hasta: finComparativo,
  });
  const mesAnterior = mesComparativo({
    ventas: ventasMes,
    egresos: egresosMes,
    desde: inicioMesAnterior,
    hasta: inicioMesActual,
  });

  return {
    dias,
    horas,
    topProductos,
    margenProductos,
    sinMovimiento,
    metodosPago,
    totalVentasPeriodo,
    mesActual,
    mesAnterior,
  };
}

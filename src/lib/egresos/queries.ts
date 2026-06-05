import { createClient } from '@/lib/supabase/server';
import type { CategoriaEgreso } from './schemas';

export type Egreso = {
  id: string;
  categoria: CategoriaEgreso;
  proveedor: string | null;
  descripcion: string | null;
  monto: number;
  fecha: string;
  metodo_pago: string;
  comprobante_url: string | null;
  fuente: 'manual' | 'whatsapp_ia' | 'recurrente';
  recurrente: boolean;
  created_at: string;
};

export async function getEgresos(empresaId: string, limit = 50): Promise<Egreso[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('egresos')
    .select('id, categoria, proveedor, descripcion, monto, fecha, metodo_pago, comprobante_url, fuente, recurrente, created_at')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data) return [];
  return data.map((e) => ({ ...e, monto: Number(e.monto) })) as Egreso[];
}

export type RangoEgresos = '7d' | '30d' | 'mes';

export type EgresosPagina = {
  rows: Egreso[];
  rango: RangoEgresos;
  page: number;
  pageSize: number;
  totalRegistros: number;
  totalPaginas: number;
};

export const PAGE_SIZE_EGRESOS = 20;

function desdePorRangoEgresos(rango: RangoEgresos): string {
  const ahora = new Date();
  if (rango === 'mes') {
    return new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0, 10);
  }
  const dias = rango === '7d' ? 7 : 30;
  const d = new Date(ahora);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Gastos paginados (server-side) filtrados por rango de fecha. */
export async function getEgresosPaginados(
  empresaId: string,
  opts: { rango?: RangoEgresos; page?: number } = {},
): Promise<EgresosPagina> {
  const rango = opts.rango ?? '30d';
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = PAGE_SIZE_EGRESOS;
  const desde = desdePorRangoEgresos(rango);

  const supabase = await createClient();
  const { data, count } = await supabase
    .from('egresos')
    .select(
      'id, categoria, proveedor, descripcion, monto, fecha, metodo_pago, comprobante_url, fuente, recurrente, created_at',
      { count: 'exact' },
    )
    .eq('empresa_id', empresaId)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const rows = (data ?? []).map((e) => ({ ...e, monto: Number(e.monto) })) as Egreso[];
  const totalRegistros = count ?? rows.length;

  return {
    rows,
    rango,
    page,
    pageSize,
    totalRegistros,
    totalPaginas: Math.max(1, Math.ceil(totalRegistros / pageSize)),
  };
}

export async function getEgreso(empresaId: string, id: string): Promise<Egreso | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('egresos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return { ...data, monto: Number(data.monto) } as Egreso;
}

export type EgresosStats = {
  totalMes: number;
  totalSemana: number;
  totalHoy: number;
  cantMes: number;
  porCategoria: { categoria: CategoriaEgreso; total: number }[];
};

export async function getEgresosStats(empresaId: string): Promise<EgresosStats> {
  const supabase = await createClient();
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const inicioSemana = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hoyStr = hoy.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('egresos')
    .select('categoria, monto, fecha')
    .eq('empresa_id', empresaId)
    .gte('fecha', inicioMes);

  if (!data) return { totalMes: 0, totalSemana: 0, totalHoy: 0, cantMes: 0, porCategoria: [] };

  let totalMes = 0;
  let totalSemana = 0;
  let totalHoy = 0;
  const cat: Record<string, number> = {};

  for (const e of data) {
    const monto = Number(e.monto);
    totalMes += monto;
    if (e.fecha >= inicioSemana) totalSemana += monto;
    if (e.fecha === hoyStr) totalHoy += monto;
    cat[e.categoria] = (cat[e.categoria] ?? 0) + monto;
  }

  const porCategoria = Object.entries(cat)
    .map(([categoria, total]) => ({ categoria: categoria as CategoriaEgreso, total }))
    .sort((a, b) => b.total - a.total);

  return { totalMes, totalSemana, totalHoy, cantMes: data.length, porCategoria };
}

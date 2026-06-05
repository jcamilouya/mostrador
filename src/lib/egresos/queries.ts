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

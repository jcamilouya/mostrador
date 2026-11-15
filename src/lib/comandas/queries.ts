import { createClient } from '@/lib/supabase/server';
import type { ComandaTicket } from './ticket';

export type Comanda = ComandaTicket & { id: string; impresa_en: string | null };

/**
 * Comandas del turno (últimas 16 h), la más nueva primero. Lee con la sesión
 * (RLS). Devuelve null si falta la migración 023.
 */
export async function getComandas(empresaId: string): Promise<Comanda[] | null> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('comandas')
    .select('id, numero, tipo, titulo, detalle, items, creado_por, created_at, impresa_en')
    .eq('empresa_id', empresaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) return error.code === '42P01' || error.code === 'PGRST205' ? null : [];
  return (data ?? []).map((c) => ({
    id: c.id as string,
    numero: Number(c.numero),
    tipo: c.tipo as Comanda['tipo'],
    titulo: c.titulo as string,
    detalle: (c.detalle as string | null) ?? null,
    items: Array.isArray(c.items) ? (c.items as Comanda['items']) : [],
    creado_por: (c.creado_por as string | null) ?? null,
    created_at: c.created_at as string,
    impresa_en: (c.impresa_en as string | null) ?? null,
  }));
}

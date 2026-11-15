'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { exigir } from '@/lib/auth/actor';
import type { ComandaTicket } from './ticket';

/**
 * La impresora de cocina "toma" una comanda antes de imprimirla: marca
 * `impresa_en` SOLO si estaba vacía. Si dos computadores tienen activada la
 * impresión (o la misma pestaña abierta dos veces), solo uno la imprime.
 * Devuelve la comanda si este equipo la ganó, o null.
 */
export async function tomarParaImprimir(id: string): Promise<ComandaTicket | null> {
  const q = await exigir('atender');
  if (!q.ok || !z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient()
    .from('comandas')
    .update({ impresa_en: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', q.actor.empresaId)
    .is('impresa_en', null)
    .select('numero, tipo, titulo, detalle, items, creado_por, created_at')
    .maybeSingle();
  if (!data) return null;
  return {
    numero: Number(data.numero),
    tipo: data.tipo as ComandaTicket['tipo'],
    titulo: data.titulo as string,
    detalle: (data.detalle as string | null) ?? null,
    items: Array.isArray(data.items) ? (data.items as ComandaTicket['items']) : [],
    creado_por: (data.creado_por as string | null) ?? null,
    created_at: data.created_at as string,
  };
}

/** Comandas recientes que nadie ha impreso (se cayó el internet, etc.). */
export async function comandasSinImprimir(): Promise<string[]> {
  const q = await exigir('atender');
  if (!q.ok) return [];
  const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await createAdminClient()
    .from('comandas')
    .select('id')
    .eq('empresa_id', q.actor.empresaId)
    .is('impresa_en', null)
    .gte('created_at', desde)
    .order('numero', { ascending: true })
    .limit(20);
  return (data ?? []).map((c) => c.id as string);
}

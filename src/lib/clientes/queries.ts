import { createClient } from '@/lib/supabase/server';

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  notas: string | null;
  total_compras: number;
  cantidad_compras: number;
  ultima_compra: string | null;
  created_at: string;
};

export type ClienteVenta = {
  id: string;
  numero_venta: number;
  total: number;
  metodo_pago: string;
  estado: string;
  created_at: string;
};

const SELECT_CLIENTE =
  'id, nombre, telefono, notas, total_compras, cantidad_compras, ultima_compra, created_at';

/**
 * Limpia el término antes de meterlo en un filtro `.or()` de PostgREST.
 * Quita los caracteres que tienen significado en la gramática del filtro
 * (comas, paréntesis, asteriscos) para evitar inyección.
 */
export function sanitizarTermino(s: string): string {
  return s.replace(/[,()*\\]/g, ' ').trim();
}

function mapCliente(c: Record<string, unknown>): Cliente {
  return {
    id: c.id as string,
    nombre: c.nombre as string,
    telefono: (c.telefono as string) ?? null,
    notas: (c.notas as string) ?? null,
    total_compras: Number(c.total_compras) || 0,
    cantidad_compras: Number(c.cantidad_compras) || 0,
    ultima_compra: (c.ultima_compra as string) ?? null,
    created_at: c.created_at as string,
  };
}

/** Lista de clientes de la empresa, opcionalmente filtrada por nombre o teléfono. */
export async function getClientes(empresaId: string, query?: string): Promise<Cliente[]> {
  const supabase = await createClient();
  let q = supabase
    .from('clientes')
    .select(SELECT_CLIENTE)
    .eq('empresa_id', empresaId);

  const term = sanitizarTermino(query ?? '');
  if (term.length >= 1) {
    q = q.or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`);
  }

  const { data } = await q.order('ultima_compra', { ascending: false, nullsFirst: false }).limit(100);
  return (data ?? []).map(mapCliente);
}

export async function getCliente(empresaId: string, id: string): Promise<Cliente | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('clientes')
    .select(SELECT_CLIENTE)
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  return data ? mapCliente(data) : null;
}

/** Historial de ventas de un cliente. */
export async function getVentasCliente(
  empresaId: string,
  clienteId: string,
): Promise<ClienteVenta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ventas')
    .select('id, numero_venta, total, metodo_pago, estado, created_at')
    .eq('empresa_id', empresaId)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((v) => ({
    id: v.id,
    numero_venta: v.numero_venta,
    total: Number(v.total) || 0,
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    created_at: v.created_at,
  }));
}

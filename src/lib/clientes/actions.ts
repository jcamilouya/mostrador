'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizarTermino } from './queries';

async function getEmpresaIdValidado(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  return usuario?.empresa_id ?? null;
}

const clienteSchema = z.object({
  nombre: z.string().trim().min(1, { error: 'El nombre es obligatorio' }).max(120),
  telefono: z.string().trim().max(30).optional().or(z.literal('')),
  notas: z.string().trim().max(500).optional().or(z.literal('')),
});

export type ClienteState = { ok?: boolean; error?: string; clienteId?: string };

export type ClienteMini = {
  id: string;
  nombre: string;
  telefono: string | null;
};

/** Búsqueda en vivo para el POS (devuelve hasta 5 coincidencias). */
export async function buscarClientes(query: string): Promise<ClienteMini[]> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return [];
  const term = sanitizarTermino(query);
  if (term.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre, telefono')
    .eq('empresa_id', empresaId)
    .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`)
    .limit(5);

  return (data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono ?? null,
  }));
}

/** Crea un cliente. Reutilizable desde el form de clientes y desde el POS/recibo. */
export async function crearCliente(input: {
  nombre: string;
  telefono?: string;
  notas?: string;
}): Promise<ClienteState> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = clienteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('clientes')
    .insert({
      empresa_id: empresaId,
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono || null,
      notas: parsed.data.notas || null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'No pudimos guardar el cliente.' };

  revalidatePath('/dashboard/clientes');
  return { ok: true, clienteId: data.id };
}

export async function crearClienteForm(
  _prev: ClienteState,
  formData: FormData,
): Promise<ClienteState> {
  return crearCliente({
    nombre: String(formData.get('nombre') ?? ''),
    telefono: String(formData.get('telefono') ?? ''),
    notas: String(formData.get('notas') ?? ''),
  });
}

export async function actualizarCliente(
  id: string,
  _prev: ClienteState,
  formData: FormData,
): Promise<ClienteState> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = clienteSchema.safeParse({
    nombre: formData.get('nombre') ?? '',
    telefono: formData.get('telefono') ?? '',
    notas: formData.get('notas') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('clientes')
    .update({
      nombre: parsed.data.nombre,
      telefono: parsed.data.telefono || null,
      notas: parsed.data.notas || null,
    })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) return { error: 'No pudimos actualizar el cliente.' };

  revalidatePath('/dashboard/clientes');
  revalidatePath(`/dashboard/clientes/${id}`);
  return { ok: true, clienteId: id };
}

/**
 * Flujo unificado desde la pantalla "venta registrada":
 * - Si viene clienteId: guarda/actualiza su teléfono en la ficha.
 * - Si NO viene clienteId pero sí nombre: crea el cliente, lo vincula a la
 *   venta y le suma esa compra a sus acumulados.
 * Devuelve el clienteId resultante.
 */
export async function guardarClienteDesdeRecibo(input: {
  ventaId: string;
  clienteId?: string | null;
  nombre?: string;
  telefono?: string;
}): Promise<ClienteState> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { error: 'No autenticado' };

  const telefono = (input.telefono ?? '').trim();
  const admin = createAdminClient();

  // Caso 1: cliente existente → solo guardamos su teléfono.
  if (input.clienteId) {
    if (telefono) {
      await admin
        .from('clientes')
        .update({ telefono })
        .eq('id', input.clienteId)
        .eq('empresa_id', empresaId);
    }
    return { ok: true, clienteId: input.clienteId };
  }

  // Caso 2: cliente nuevo → crear, vincular a la venta y sumar la compra.
  const nombre = (input.nombre ?? '').trim();
  if (!nombre) return { error: 'Falta el nombre del cliente' };

  // Leemos la venta para vincularla y conocer su total (validando empresa).
  const { data: venta } = await admin
    .from('ventas')
    .select('id, total, estado, cliente_id')
    .eq('id', input.ventaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!venta) return { error: 'Venta no encontrada' };

  const { data: nuevo, error: insErr } = await admin
    .from('clientes')
    .insert({
      empresa_id: empresaId,
      nombre,
      telefono: telefono || null,
      total_compras: venta.estado === 'completada' ? Number(venta.total) || 0 : 0,
      cantidad_compras: venta.estado === 'completada' ? 1 : 0,
      ultima_compra: venta.estado === 'completada' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (insErr || !nuevo) return { error: 'No pudimos guardar el cliente.' };

  // Vincular la venta al cliente recién creado (si no tenía uno).
  if (!venta.cliente_id) {
    await admin
      .from('ventas')
      .update({ cliente_id: nuevo.id })
      .eq('id', input.ventaId)
      .eq('empresa_id', empresaId);
  }

  revalidatePath('/dashboard/clientes');
  revalidatePath('/dashboard/ingresos');
  return { ok: true, clienteId: nuevo.id };
}

export async function eliminarCliente(id: string): Promise<void> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return;
  const admin = createAdminClient();
  await admin.from('clientes').delete().eq('id', id).eq('empresa_id', empresaId);
  revalidatePath('/dashboard/clientes');
}

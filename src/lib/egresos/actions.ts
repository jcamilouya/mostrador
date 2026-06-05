'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { egresoSchema } from './schemas';

export type ActionState = { error?: string; ok?: boolean };

async function requireEmpresaId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  return data?.empresa_id ?? null;
}

export async function crearEgreso(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) redirect('/login');

  const parsed = egresoSchema.safeParse({
    categoria: formData.get('categoria'),
    proveedor: formData.get('proveedor') ?? '',
    descripcion: formData.get('descripcion') ?? '',
    monto: formData.get('monto') ?? '0',
    fecha: formData.get('fecha') ?? new Date().toISOString().slice(0, 10),
    metodo_pago: formData.get('metodo_pago') ?? 'efectivo',
    comprobante_url: formData.get('comprobante_url') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('egresos').insert({
    empresa_id: empresaId,
    categoria: parsed.data.categoria,
    proveedor: parsed.data.proveedor || null,
    descripcion: parsed.data.descripcion || null,
    monto: parsed.data.monto,
    fecha: parsed.data.fecha,
    metodo_pago: parsed.data.metodo_pago,
    comprobante_url: parsed.data.comprobante_url || null,
    fuente: 'manual',
  });

  if (error) return { error: 'No pudimos guardar el gasto. Intenta de nuevo.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/egresos');
  redirect('/dashboard/egresos');
}

export async function actualizarEgreso(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) redirect('/login');

  const parsed = egresoSchema.safeParse({
    categoria: formData.get('categoria'),
    proveedor: formData.get('proveedor') ?? '',
    descripcion: formData.get('descripcion') ?? '',
    monto: formData.get('monto') ?? '0',
    fecha: formData.get('fecha'),
    metodo_pago: formData.get('metodo_pago') ?? 'efectivo',
    comprobante_url: formData.get('comprobante_url') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('egresos')
    .update({
      categoria: parsed.data.categoria,
      proveedor: parsed.data.proveedor || null,
      descripcion: parsed.data.descripcion || null,
      monto: parsed.data.monto,
      fecha: parsed.data.fecha,
      metodo_pago: parsed.data.metodo_pago,
      comprobante_url: parsed.data.comprobante_url || null,
    })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) return { error: 'No pudimos actualizar el gasto.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/egresos');
  redirect('/dashboard/egresos');
}

export async function eliminarEgreso(id: string): Promise<void> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return;
  const admin = createAdminClient();
  await admin.from('egresos').delete().eq('id', id).eq('empresa_id', empresaId);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/egresos');
}

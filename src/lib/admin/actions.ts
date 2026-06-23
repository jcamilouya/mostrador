'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from './auth';

export type AdminActionState = { error?: string; ok?: boolean };

const DAY_MS = 86_400_000;
const planSchema = z.enum(['trial', 'basico', 'pro']);

type EmpresaSusc = { nombre: string; plan: string; plan_expira_en: string | null };

async function fetchEmpresa(id: string): Promise<EmpresaSusc | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('empresas')
    .select('nombre, plan, plan_expira_en')
    .eq('id', id)
    .maybeSingle();
  return (data as EmpresaSusc | null) ?? null;
}

async function registrar(
  adminEmail: string,
  empresaId: string,
  empresaNombre: string,
  accion: string,
  antes: unknown,
  despues: unknown,
) {
  const admin = createAdminClient();
  await admin.from('admin_log').insert({
    admin_email: adminEmail,
    empresa_id: empresaId,
    empresa_nombre: empresaNombre,
    accion,
    detalle: { antes, despues },
  });
}

function revalidar(id: string) {
  revalidatePath('/admin');
  revalidatePath('/admin/empresas');
  revalidatePath(`/admin/empresas/${id}`);
}

/** Cambia plan + fecha de expiración manualmente. */
export async function guardarSuscripcion(
  empresaId: string,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireSuperAdmin();

  const parsedPlan = planSchema.safeParse(formData.get('plan'));
  if (!parsedPlan.success) return { error: 'Plan inválido' };

  const expiraRaw = ((formData.get('plan_expira_en') as string | null) ?? '').trim();
  const expira = expiraRaw === '' ? null : expiraRaw;

  const empresa = await fetchEmpresa(empresaId);
  if (!empresa) return { error: 'Empresa no encontrada' };

  const db = createAdminClient();
  const { error } = await db
    .from('empresas')
    .update({ plan: parsedPlan.data, plan_expira_en: expira })
    .eq('id', empresaId);
  if (error) return { error: 'No se pudo guardar. Intenta de nuevo.' };

  await registrar(
    admin.email,
    empresaId,
    empresa.nombre,
    'cambiar_plan',
    { plan: empresa.plan, plan_expira_en: empresa.plan_expira_en },
    { plan: parsedPlan.data, plan_expira_en: expira },
  );

  revalidar(empresaId);
  return { ok: true };
}

/** Suma N días a la expiración (desde hoy si ya venció). */
export async function extenderDias(empresaId: string, dias: number): Promise<void> {
  const admin = await requireSuperAdmin();
  const empresa = await fetchEmpresa(empresaId);
  if (!empresa) return;

  const ahora = Date.now();
  const baseMs = empresa.plan_expira_en
    ? Math.max(ahora, new Date(empresa.plan_expira_en).getTime())
    : ahora;
  const nueva = new Date(baseMs + dias * DAY_MS).toISOString();

  const db = createAdminClient();
  await db.from('empresas').update({ plan_expira_en: nueva }).eq('id', empresaId);

  await registrar(
    admin.email,
    empresaId,
    empresa.nombre,
    'extender',
    { plan_expira_en: empresa.plan_expira_en },
    { plan_expira_en: nueva, dias },
  );

  revalidar(empresaId);
}

/** Activa Pro manualmente (1 mes pagado). */
export async function activarPro(empresaId: string): Promise<void> {
  const admin = await requireSuperAdmin();
  const empresa = await fetchEmpresa(empresaId);
  if (!empresa) return;

  const expira = new Date(Date.now() + 30 * DAY_MS).toISOString();
  const db = createAdminClient();
  await db.from('empresas').update({ plan: 'pro', plan_expira_en: expira }).eq('id', empresaId);

  await registrar(
    admin.email,
    empresaId,
    empresa.nombre,
    'activar_pro',
    { plan: empresa.plan, plan_expira_en: empresa.plan_expira_en },
    { plan: 'pro', plan_expira_en: expira },
  );

  revalidar(empresaId);
}

/** Guarda notas internas de soporte. */
export async function guardarNotas(
  empresaId: string,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireSuperAdmin();
  const notas = ((formData.get('notas_internas') as string | null) ?? '').slice(0, 5000);

  const empresa = await fetchEmpresa(empresaId);
  if (!empresa) return { error: 'Empresa no encontrada' };

  const db = createAdminClient();
  const { error } = await db
    .from('empresas')
    .update({ notas_internas: notas || null })
    .eq('id', empresaId);
  if (error) return { error: 'No se pudieron guardar las notas.' };

  await registrar(admin.email, empresaId, empresa.nombre, 'notas', null, { caracteres: notas.length });
  revalidar(empresaId);
  return { ok: true };
}

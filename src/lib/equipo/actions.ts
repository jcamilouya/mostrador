'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { exigir } from '@/lib/auth/actor';
import { DOMINIO_EQUIPO } from '@/lib/auth/roles';

export type Resultado = { ok: true } | { ok: false; error: string };

const SIN_MIGRACION = 'Para crear tu equipo falta correr la migración 023 en Supabase.';
const MAX_EQUIPO = 30;

const usuarioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, {
    error: 'El usuario va en minúsculas, sin espacios ni tildes (ej: carlos.sabore)',
  });

const claveSchema = z
  .string()
  .min(6, { error: 'La contraseña necesita al menos 6 caracteres' })
  .max(72);

const personaSchema = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribe el nombre' }).max(60),
  rol: z.enum(['mesero', 'caja']),
  usuario: usuarioSchema,
  clave: claveSchema,
});

/**
 * Crea una persona del equipo: una cuenta de Supabase Auth con correo interno
 * (usuario@equipo.mostrador.app, ya confirmado) y su fila en `usuarios` con el
 * rol. El rol va también en `app_metadata` (solo el servidor puede escribirlo)
 * para que el proxy sepa qué pantallas mostrar sin consultar la base.
 */
export async function crearPersona(input: unknown): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  const parsed = personaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { nombre, rol, usuario, clave } = parsed.data;
  const { empresaId } = quien.actor;
  const admin = createAdminClient();

  const { count, error: cuentaErr } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .neq('rol', 'dueno');
  if (cuentaErr?.code === '42703') return { ok: false, error: SIN_MIGRACION };
  if ((count ?? 0) >= MAX_EQUIPO) return { ok: false, error: `Máximo ${MAX_EQUIPO} personas en el equipo.` };

  const email = `${usuario}@${DOMINIO_EQUIPO}`;
  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    app_metadata: { rol, empresa_id: empresaId },
    user_metadata: { nombre },
  });
  if (error || !creado.user) {
    if (/already|registered|exists/i.test(error?.message ?? '')) {
      return { ok: false, error: 'Ese usuario ya existe. Prueba con otro.' };
    }
    return { ok: false, error: 'No pudimos crear la cuenta. Intenta de nuevo.' };
  }

  const { error: filaErr } = await admin.from('usuarios').insert({
    id: creado.user.id,
    empresa_id: empresaId,
    nombre,
    email,
    rol,
    usuario,
  });
  if (filaErr) {
    // Sin la fila, la cuenta no sirve: se borra para no dejar basura.
    await admin.auth.admin.deleteUser(creado.user.id);
    if (filaErr.code === '23505') return { ok: false, error: 'Ese usuario ya existe. Prueba con otro.' };
    if (filaErr.code === '42703' || filaErr.code === 'PGRST204') return { ok: false, error: SIN_MIGRACION };
    return { ok: false, error: 'No pudimos crear la cuenta. Intenta de nuevo.' };
  }

  revalidatePath('/dashboard/equipo');
  return { ok: true };
}

/** La persona es del equipo de ESTE negocio y no es el dueño. */
async function delEquipo(empresaId: string, userId: string) {
  if (!z.uuid().safeParse(userId).success) return null;
  const { data } = await createAdminClient()
    .from('usuarios')
    .select('id, rol, nombre')
    .eq('id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!data || data.rol === 'dueno') return null;
  return data;
}

export async function cambiarClave(userId: string, clave: string): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  const c = claveSchema.safeParse(clave);
  if (!c.success) return { ok: false, error: c.error.issues[0]?.message ?? 'Contraseña inválida' };
  if (!(await delEquipo(quien.actor.empresaId, userId))) return { ok: false, error: 'Esa persona no es de tu equipo.' };
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password: c.data });
  if (error) return { ok: false, error: 'No pudimos cambiar la contraseña.' };
  return { ok: true };
}

export async function cambiarRol(userId: string, rol: string): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  if (rol !== 'mesero' && rol !== 'caja') return { ok: false, error: 'Rol inválido' };
  if (!(await delEquipo(quien.actor.empresaId, userId))) return { ok: false, error: 'Esa persona no es de tu equipo.' };
  const admin = createAdminClient();
  const { error } = await admin.from('usuarios').update({ rol }).eq('id', userId).eq('empresa_id', quien.actor.empresaId);
  if (error) return { ok: false, error: 'No pudimos cambiar el rol.' };
  await admin.auth.admin.updateUserById(userId, { app_metadata: { rol, empresa_id: quien.actor.empresaId } });
  revalidatePath('/dashboard/equipo');
  return { ok: true };
}

/**
 * Desactivar = no puede entrar (se bloquea en Auth) y, si ya tenía la app
 * abierta, el servidor le niega todo (`getActor` mira `activo`).
 */
export async function cambiarActivo(userId: string, activo: boolean): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  if (!(await delEquipo(quien.actor.empresaId, userId))) return { ok: false, error: 'Esa persona no es de tu equipo.' };
  const admin = createAdminClient();
  const { error } = await admin
    .from('usuarios')
    .update({ activo })
    .eq('id', userId)
    .eq('empresa_id', quien.actor.empresaId);
  if (error) return { ok: false, error: 'No pudimos cambiarlo.' };
  await admin.auth.admin.updateUserById(userId, { ban_duration: activo ? 'none' : '876000h' });
  revalidatePath('/dashboard/equipo');
  return { ok: true };
}

export async function borrarPersona(userId: string): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  if (!(await delEquipo(quien.actor.empresaId, userId))) return { ok: false, error: 'Esa persona no es de tu equipo.' };
  const admin = createAdminClient();
  const { error } = await admin.from('usuarios').delete().eq('id', userId).eq('empresa_id', quien.actor.empresaId);
  if (error) return { ok: false, error: 'No pudimos borrarla. Puedes desactivarla.' };
  await admin.auth.admin.deleteUser(userId);
  revalidatePath('/dashboard/equipo');
  return { ok: true };
}

export async function guardarMeseroCobra(valor: boolean): Promise<Resultado> {
  const quien = await exigir('administrar');
  if (!quien.ok) return quien;
  const { error } = await createAdminClient()
    .from('empresas')
    .update({ mesero_cobra: valor })
    .eq('id', quien.actor.empresaId);
  if (error) return { ok: false, error: error.code === 'PGRST204' ? SIN_MIGRACION : 'No pudimos guardarlo.' };
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

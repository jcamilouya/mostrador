import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { normalizarRol, puede, type Permiso, type Rol } from './roles';

/**
 * Quién está haciendo la acción, con su rol LEÍDO DE LA BASE (no del token ni
 * del navegador). Lo usan los Server Actions para decidir si dejan pasar.
 * Cacheado por request.
 *
 * Degrada sin la migración 023: si `rol` no existe, todos son dueño (como
 * antes, una cuenta por negocio).
 */
export type Actor = {
  userId: string;
  empresaId: string;
  nombre: string;
  rol: Rol;
  meseroCobra: boolean;
};

export const getActor = cache(async (): Promise<Actor | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const CAMPOS = [
    'empresa_id, nombre, rol, activo, empresas (mesero_cobra)',
    'empresa_id, nombre',
  ];
  for (const campos of CAMPOS) {
    const { data, error } = await supabase.from('usuarios').select(campos).eq('id', user.id).maybeSingle();
    if (error) continue;
    if (!data) return null;
    const fila = data as unknown as Record<string, unknown>;
    if (!fila.empresa_id) return null;
    // Una persona desactivada por el dueño no puede hacer nada, aunque su
    // sesión siga viva en algún celular.
    if (fila.activo === false) return null;
    const emp = (Array.isArray(fila.empresas) ? fila.empresas[0] : fila.empresas) as
      | { mesero_cobra?: boolean }
      | null
      | undefined;
    return {
      userId: user.id,
      empresaId: fila.empresa_id as string,
      nombre: (fila.nombre as string) || 'Equipo',
      rol: normalizarRol(fila.rol),
      meseroCobra: emp?.mesero_cobra === true,
    };
  }
  return null;
});

const NEGADO: Record<Permiso, string> = {
  atender: 'No tienes permiso para esto.',
  cobrar: 'Solo la caja puede cobrar. Pídele a la caja que cobre esta cuenta.',
  anular: 'Solo la caja o el dueño pueden anular.',
  clientes: 'Solo la caja o el dueño pueden cambiar clientes.',
  administrar: 'Esto solo lo puede hacer el dueño del negocio.',
};

/**
 * Para el inicio de cada Server Action: devuelve el actor si tiene el
 * permiso, o un mensaje de error para mostrar.
 */
export async function exigir(
  permiso: Permiso,
): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: 'No autenticado' };
  if (!puede(actor.rol, permiso, actor.meseroCobra)) return { ok: false, error: NEGADO[permiso] };
  return { ok: true, actor };
}

/** Versión corta: el mensaje de error, o null si puede. */
export async function negado(permiso: Permiso): Promise<string | null> {
  const r = await exigir(permiso);
  return r.ok ? null : r.error;
}

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type SesionUsuario = {
  userId: string;
  email: string | null;
  empresaId: string | null;
  nombre: string | null;
  empresaNombre: string;
  /** Tipo de negocio (restaurante, tienda…). Decide qué menú ve en el celular. */
  empresaCategoria: string | null;
};

/**
 * Quién está usando la app y a qué empresa pertenece, UNA sola vez por request.
 *
 * Antes, cada navegación preguntaba la identidad tres veces (el layout, la
 * página y `getEmpresaIdDelUsuario`), y cada una costaba dos viajes a Supabase:
 * ~350 ms perdidos antes de pedir el primer dato útil. `cache()` de React
 * deduplica la llamada dentro del mismo request, así que el layout y la página
 * comparten el resultado.
 */
export const getSesion = cache(async (): Promise<SesionUsuario | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Sin la migración 015 la columna `categoria` no existe: se reintenta sin ella
  // para no tumbar toda la app por un dato opcional.
  let { data } = await supabase
    .from('usuarios')
    .select('empresa_id, nombre, empresas (nombre, categoria)')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) {
    ({ data } = await supabase
      .from('usuarios')
      .select('empresa_id, nombre, empresas (nombre)')
      .eq('id', user.id)
      .maybeSingle());
  }

  const empresa = Array.isArray(data?.empresas) ? data?.empresas[0] : data?.empresas;
  const emp = empresa as { nombre?: string; categoria?: string | null } | null;

  return {
    userId: user.id,
    email: user.email ?? null,
    empresaId: data?.empresa_id ?? null,
    nombre: (data?.nombre as string | null) ?? null,
    empresaNombre: emp?.nombre ?? 'Mi negocio',
    empresaCategoria: emp?.categoria ?? null,
  };
});

/** Atajo: el id de la empresa del usuario actual (o null si no tiene sesión). */
export async function getEmpresaId(): Promise<string | null> {
  const sesion = await getSesion();
  return sesion?.empresaId ?? null;
}

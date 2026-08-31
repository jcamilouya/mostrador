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
  /** El negocio está aprendiendo: el POS no guarda nada de lo que venda. */
  modoPractica: boolean;
  /** Ya vio los globos de la pantalla de vender. */
  guiaPosVista: boolean;
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

  // Cada migración degrada por su lado: si falta la 016 no se pueden perder
  // también los datos de la 015, o el menú del celular dejaría de saber qué
  // vende el negocio.
  const CAMPOS = [
    'empresa_id, nombre, empresas (nombre, categoria, modo_practica, guia_pos_vista)',
    'empresa_id, nombre, empresas (nombre, categoria)',
    'empresa_id, nombre, empresas (nombre)',
  ];
  let data: Record<string, unknown> | null = null;
  for (const campos of CAMPOS) {
    const res = await supabase.from('usuarios').select(campos).eq('id', user.id).maybeSingle();
    if (res.data) {
      data = res.data as unknown as Record<string, unknown>;
      break;
    }
    // Si la fila simplemente no existe (usuario sin empresa), no seguir probando.
    if (!res.error) break;
  }

  const rel = data?.empresas;
  const empresa = Array.isArray(rel) ? rel[0] : rel;
  const emp = empresa as {
    nombre?: string;
    categoria?: string | null;
    modo_practica?: boolean;
    guia_pos_vista?: boolean;
  } | null;

  return {
    userId: user.id,
    email: user.email ?? null,
    empresaId: (data?.empresa_id as string | null) ?? null,
    nombre: (data?.nombre as string | null) ?? null,
    empresaNombre: emp?.nombre ?? 'Mi negocio',
    empresaCategoria: emp?.categoria ?? null,
    modoPractica: emp?.modo_practica === true,
    guiaPosVista: emp?.guia_pos_vista === true,
  };
});

/** Atajo: el id de la empresa del usuario actual (o null si no tiene sesión). */
export async function getEmpresaId(): Promise<string | null> {
  const sesion = await getSesion();
  return sesion?.empresaId ?? null;
}

import { createAdminClient } from '@/lib/supabase/admin';
import type { Rol } from '@/lib/auth/roles';

export type Persona = {
  id: string;
  nombre: string;
  usuario: string | null;
  rol: Rol;
  activo: boolean;
};

/**
 * El equipo del negocio. Usa el admin client porque la RLS de `usuarios` solo
 * deja leer la fila propia: la página que lo llama SOLO la ve el dueño (proxy
 * + `exigir('administrar')` en las acciones). Devuelve null si falta la 023.
 */
export async function getEquipo(empresaId: string): Promise<Persona[] | null> {
  const { data, error } = await createAdminClient()
    .from('usuarios')
    .select('id, nombre, usuario, rol, activo, created_at')
    .eq('empresa_id', empresaId)
    .neq('rol', 'dueno')
    .order('created_at', { ascending: true });
  if (error) return null;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    usuario: (p.usuario as string | null) ?? null,
    rol: p.rol as Rol,
    activo: p.activo !== false,
  }));
}

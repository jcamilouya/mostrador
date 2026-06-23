import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type SuperAdmin = { id: string; email: string };

/** Lista blanca de correos con acceso al panel admin, desde SUPER_ADMIN_EMAILS. */
function allowlist(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().includes(email.toLowerCase());
}

/**
 * Devuelve el super admin autenticado, o null si no hay sesión o el correo
 * no está en la allowlist. No lanza — úsalo para decidir si mostrar 404.
 */
export async function getSuperAdmin(): Promise<SuperAdmin | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isSuperAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}

/**
 * Exige super admin. Para usar en Server Actions: si no lo es, redirige a la
 * raíz (no revelamos que /admin existe). Devuelve el admin si pasa.
 */
export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const admin = await getSuperAdmin();
  if (!admin) redirect('/');
  return admin;
}

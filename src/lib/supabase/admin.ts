import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase con service_role.
 * SOLO usar en server-side (API routes, Server Actions, route handlers).
 * Bypasea RLS — debe usarse SIEMPRE después de validar la identidad del user
 * con `await createServerClient().auth.getUser()`.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

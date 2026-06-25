import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSuperAdminEmail } from '@/lib/admin/auth';

// Diagnóstico TEMPORAL para depurar el acceso a /admin. Eliminar luego.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const env = (process.env.SUPER_ADMIN_EMAILS ?? '').trim();

  if (!user) {
    return NextResponse.json({
      loggedIn: false,
      mensaje: 'No hay sesión. Inicia sesión primero y vuelve a abrir esta URL.',
      envConfigurado: Boolean(env),
    });
  }

  return NextResponse.json({
    loggedIn: true,
    tuCorreo: user.email,
    envConfigurado: Boolean(env),
    listaAdmin: env.split(',').map((s) => s.trim()).filter(Boolean),
    esAdmin: isSuperAdminEmail(user.email),
  });
}

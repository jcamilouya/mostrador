import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Callback de autenticación de Supabase.
 *
 * Soporta los dos formatos de enlace que puede enviar Supabase:
 *  - PKCE / OAuth:  ?code=...           → exchangeCodeForSession
 *  - Email link:    ?token_hash=&type=  → verifyOtp (funciona aunque el correo
 *                                          se abra en otro dispositivo/navegador)
 *
 * Si el enlace viene de una confirmación de correo (confirmar=1), al terminar
 * lleva a una página amigable de "correo confirmado" que entra solo a la app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';
  // Marca que el enlace nació de una confirmación de correo (lo pone signUp).
  const esConfirmacion = searchParams.get('confirmar') === '1' || type === 'signup';

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    if (esConfirmacion) {
      return NextResponse.redirect(
        `${origin}/auth/confirmado?next=${encodeURIComponent(next)}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Error: en vez de una página fea, mandamos a la pantalla amigable.
  if (esConfirmacion) {
    return NextResponse.redirect(`${origin}/auth/confirmado?error=1`);
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}

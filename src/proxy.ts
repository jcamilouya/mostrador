import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { inicioDe, normalizarRol, rutaPermitida } from '@/lib/auth/roles';

/**
 * Guardia de rutas que corre ANTES de renderizar.
 *
 * DOS cosas que costaron caro y no hay que volver a romper:
 *
 * 1) El archivo va en `src/`, al lado de `app/`. Estaba en la raíz del
 *    proyecto (junto a `src/`) y Next lo compilaba pero NUNCA lo ejecutaba:
 *    ni un redirect incondicional se disparaba. La app no se cayó porque cada
 *    layout revalida la sesión por su cuenta, así que esto es un segundo
 *    cinturón, no el único.
 *
 * 2) En Next 16 el archivo se llama `proxy.ts` y la función `proxy`. El nombre
 *    viejo (`middleware`) está deprecado y avisa en consola.
 */
export async function proxy(request: NextRequest) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseConfigured) {
    return NextResponse.next({ request });
  }

  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/admin');

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Equipo (023): el mesero y la caja solo entran a sus pantallas. El rol
  // viene del token (`app_metadata`, que solo el servidor puede escribir al
  // crear la persona), así que esto NO consulta la base en cada clic. Es el
  // cinturón de las pantallas; el de los datos son los Server Actions, que
  // leen el rol de la base (`lib/auth/actor.ts`).
  if (user && pathname.startsWith('/dashboard')) {
    const rol = normalizarRol((user.app_metadata as Record<string, unknown> | undefined)?.rol);
    if (!rutaPermitida(rol, pathname)) {
      return NextResponse.redirect(new URL(inicioDe(rol), request.url));
    }
  }

  // Antes aquí se consultaba `usuarios` para mandar a /onboarding a quien no
  // tuviera empresa. Se quitó: el DashboardLayout hace exactamente esa misma
  // comprobación y redirige igual, así que el proxy la estaba pagando dos
  // veces en cada navegación (~90 ms de más por clic).

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/admin/:path*', '/login', '/register'],
};

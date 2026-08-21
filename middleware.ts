import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
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

  // Antes aquí se consultaba `usuarios` para mandar a /onboarding a quien no
  // tuviera empresa. Se quitó: el DashboardLayout hace exactamente esa misma
  // comprobación y redirige igual, así que el middleware la estaba pagando dos
  // veces en cada navegación (~90 ms de más por clic).

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/admin/:path*', '/login', '/register'],
};

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseConfigured) {
    return NextResponse.next({ request });
  }

  const { response, user, supabase } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isProtectedRoute =
    pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (user && pathname.startsWith('/dashboard') && supabase) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!usuario?.empresa_id) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login', '/register'],
};

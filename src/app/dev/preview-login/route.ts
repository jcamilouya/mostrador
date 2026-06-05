import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Endpoint solo para development — autentica programáticamente para tomar
 * screenshots desde Claude Code u otras herramientas headless.
 * Bloqueado en producción.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const password = searchParams.get('password');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!email || !password) {
    return new NextResponse('Missing email/password', { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return new NextResponse('Login failed: ' + error.message, { status: 401 });
  }

  return NextResponse.redirect(new URL(next, request.url));
}

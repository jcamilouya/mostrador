'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from './schemas';
import { DOMINIO_EQUIPO, inicioDe, normalizarRol } from './roles';

export type AuthState = {
  error?: string;
  success?: string;
};

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // Equipo (023): el mesero entra con su usuario ("carlos.sabore"), sin correo.
  // Por dentro su cuenta es usuario@equipo.mostrador.app.
  const escrito = String(formData.get('email') ?? '').trim().toLowerCase();
  const parsed = loginSchema.safeParse({
    email: escrito && !escrito.includes('@') ? `${escrito}@${DOMINIO_EQUIPO}` : escrito,
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: 'Usuario, email o contraseña incorrectos' };
  }

  revalidatePath('/', 'layout');
  // Cada rol entra directo a su pantalla (el mesero a Mesas). Si fuera a
  // /dashboard y el proxy lo redirigiera, la barra quedaba en /dashboard y el
  // menú no marcaba dónde está.
  redirect(inicioDe(normalizarRol(data.user?.app_metadata?.rol)));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    nombre: formData.get('nombre'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding&confirmar=1`,
      data: { nombre: parsed.data.nombre },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Ese email ya tiene cuenta. Inicia sesión.' };
    }
    return { error: 'No pudimos crear tu cuenta. Intenta de nuevo.' };
  }

  if (data.session) {
    revalidatePath('/', 'layout');
    redirect('/onboarding');
  }

  return {
    success: 'Te enviamos un email para confirmar tu cuenta. Revísalo (puede estar en spam).',
  };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth');
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

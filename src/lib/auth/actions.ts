'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from './schemas';

export type AuthState = {
  error?: string;
  success?: string;
};

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: 'Email o contraseña incorrectos' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
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
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
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

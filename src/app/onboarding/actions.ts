'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { empresaSchema } from '@/lib/auth/schemas';

export type OnboardingState = {
  error?: string;
};

export async function crearEmpresa(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // 1. Validar sesión con anon client (lee cookies, valida JWT).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 2. Validar input.
  const parsed = empresaSchema.safeParse({
    nombre_negocio: formData.get('nombre_negocio'),
    email: formData.get('email') || user.email,
    nit: formData.get('nit') ?? '',
    direccion: formData.get('direccion') ?? '',
    telefono: formData.get('telefono') ?? '',
    categoria: formData.get('categoria') ?? '',
    whatsapp_numero: formData.get('whatsapp_numero') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { nombre_negocio, email, nit, direccion, telefono, whatsapp_numero } = parsed.data;

  // 3. Mutaciones con admin (RLS bypass). Seguro: ya validamos el user arriba.
  const admin = createAdminClient();

  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      nombre: nombre_negocio,
      email,
      nit: nit || null,
      direccion: direccion || null,
      telefono: telefono || null,
      whatsapp_numero: whatsapp_numero || null,
      plan: 'trial',
      plan_expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (empresaError || !empresa) {
    if (empresaError?.code === '23505') {
      return { error: 'Ese email ya está registrado en otra empresa.' };
    }
    return { error: 'No pudimos crear tu negocio. Intenta de nuevo.' };
  }

  const nombreUsuario =
    (user.user_metadata?.nombre as string | undefined) ??
    user.email?.split('@')[0] ??
    'Dueño';

  const { error: usuarioError } = await admin.from('usuarios').insert({
    id: user.id,
    empresa_id: empresa.id,
    nombre: nombreUsuario,
    email: user.email!,
  });

  if (usuarioError) {
    await admin.from('empresas').delete().eq('id', empresa.id);
    return { error: 'No pudimos asociar tu cuenta al negocio. Intenta de nuevo.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

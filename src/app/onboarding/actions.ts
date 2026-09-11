'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { empresaSchema } from '@/lib/auth/schemas';
import { faltaColumna, nombreColumnaFaltante } from '@/lib/supabase/errores';

export type OnboardingState = {
  /** La empresa quedó creada: el registro sigue en el paso de la carta. */
  ok?: boolean;
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
  const { nombre_negocio, email, nit, direccion, telefono, whatsapp_numero, categoria } =
    parsed.data;

  // 3. Mutaciones con admin (RLS bypass). Seguro: ya validamos el user arriba.
  const admin = createAdminClient();

  // El tipo de negocio SÍ se guarda: es lo que permite arrancar a un restaurante
  // con sus categorías y ejemplos, en vez de dejarlo en una pantalla vacía.
  // Antes se preguntaba y se botaba.
  const filaEmpresa: Record<string, unknown> = {
    nombre: nombre_negocio,
    email,
    nit: nit || null,
    direccion: direccion || null,
    telefono: telefono || null,
    whatsapp_numero: whatsapp_numero || null,
    categoria: categoria || null,
    // Un negocio NUEVO arranca practicando: puede vender, cobrar y equivocarse
    // sin que nada toque sus cuentas hasta que diga "ya entendi".
    modo_practica: true,
    plan: 'trial',
    plan_expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  let { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert(filaEmpresa)
    .select('id')
    .single();

  // Si falta una migración (015 / 016), la columna nueva no existe todavía:
  // soltarla y reintentar, para que la falta de una migración NUNCA impida
  // registrar un negocio. Se suelta de a una y por nombre, así que si solo
  // falta `modo_practica` el negocio conserva su `categoria`.
  for (let intento = 0; empresaError && faltaColumna(empresaError) && intento < 4; intento++) {
    const columna = nombreColumnaFaltante(empresaError);
    if (columna && columna in filaEmpresa) {
      delete filaEmpresa[columna];
    } else {
      // No supimos cuál es: soltar todas las opcionales de golpe antes de
      // rendirnos, porque lo importante es que el negocio quede creado.
      delete filaEmpresa.categoria;
      delete filaEmpresa.modo_practica;
    }
    ({ data: empresa, error: empresaError } = await admin
      .from('empresas')
      .insert(filaEmpresa)
      .select('id')
      .single());
  }

  if (empresaError || !empresa) {
    if (empresaError?.code === '23505') {
      return { error: 'Ese email ya está registrado en otra empresa.' };
    }
    // Dejar rastro en los logs: este error dejaba al dueño repitiendo "intenta
    // de nuevo" sin que nadie supiera qué había fallado de verdad.
    console.error('[onboarding] no se pudo crear la empresa', empresaError);
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

  // OJO: no revalidar ni redirigir aqui. El registro sigue en la misma
  // pantalla con el paso de "carga tu carta", y un revalidate haria que
  // /onboarding se volviera a renderizar y expulsara al usuario al dashboard.
  return { ok: true };
}

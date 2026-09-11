'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { faltaColumna } from '@/lib/supabase/errores';
import { aSlug, slugValido } from './slug';

export type CartaState = { ok?: boolean; error?: string; slug?: string };

/** Quién es y a qué empresa pertenece. Igual que el resto de acciones. */
async function contexto() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data?.empresa_id) return null;

  return { empresaId: data.empresa_id as string, admin: createAdminClient() };
}

function refrescar(slug?: string | null) {
  revalidatePath('/dashboard/carta');
  revalidatePath('/dashboard');
  if (slug) revalidatePath(`/carta/${slug}`);
}

const guardarSchema = z.object({
  slug: z.string().trim().toLowerCase(),
  activa: z.boolean(),
});

/**
 * Enciende o apaga la carta pública y fija su link.
 *
 * Encenderla publica los platos y precios del negocio a cualquiera que tenga el
 * link: por eso `carta_activa` arranca apagada y solo se prende desde aquí, con
 * el dueño mirando el aviso que lo dice.
 */
export async function guardarCarta(
  _prev: CartaState,
  formData: FormData,
): Promise<CartaState> {
  const ctx = await contexto();
  if (!ctx) return { error: 'No autenticado' };

  const parsed = guardarSchema.safeParse({
    slug: formData.get('slug') ?? '',
    activa: formData.get('activa') === 'on' || formData.get('activa') === 'true',
  });
  if (!parsed.success) return { error: 'Datos inválidos' };

  // Si no escribió nada, se lo generamos del nombre del negocio.
  let slug = aSlug(parsed.data.slug);
  if (!slug) {
    const { data: empresa } = await ctx.admin
      .from('empresas')
      .select('nombre')
      .eq('id', ctx.empresaId)
      .maybeSingle();
    slug = aSlug(String(empresa?.nombre ?? 'mi-negocio'));
  }

  if (!slugValido(slug)) {
    return { error: 'El link debe tener al menos 2 letras o números.' };
  }

  const { error } = await ctx.admin
    .from('empresas')
    .update({ carta_slug: slug, carta_activa: parsed.data.activa })
    .eq('id', ctx.empresaId);

  if (error) {
    if (faltaColumna(error)) {
      return { error: 'Para usar la carta digital falta correr la migración 017 en Supabase.' };
    }
    // Índice único: ese link ya lo tiene otro negocio.
    if (error.code === '23505') {
      return { error: 'Ese link ya lo está usando otro negocio. Prueba con otro.' };
    }
    return { error: 'No pudimos guardar tu carta. Intenta de nuevo.' };
  }

  refrescar(slug);
  return { ok: true, slug };
}

/** Saca (o vuelve a meter) un producto de la carta pública. */
export async function alternarProductoEnCarta(
  productoId: string,
  enCarta: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  // El `empresa_id` en el WHERE es lo que impide tocar el producto de otro.
  const { error } = await ctx.admin
    .from('productos')
    .update({ en_carta: enCarta })
    .eq('id', productoId)
    .eq('empresa_id', ctx.empresaId);

  if (error) {
    if (faltaColumna(error)) {
      return { ok: false, error: 'Falta correr la migración 017 en Supabase.' };
    }
    return { ok: false, error: 'No pudimos guardar el cambio.' };
  }

  const { data } = await ctx.admin
    .from('empresas')
    .select('carta_slug')
    .eq('id', ctx.empresaId)
    .maybeSingle();

  refrescar(data?.carta_slug as string | null);
  return { ok: true };
}

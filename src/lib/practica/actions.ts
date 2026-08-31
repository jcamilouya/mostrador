'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Modo práctica: el negocio está aprendiendo.
 *
 * Decisión deliberada: en práctica el POS **no escribe nada** en la base de
 * datos. No se crea la venta, no se descuenta inventario, no sube el acumulado
 * del cliente. Se podría haber marcado cada venta como "de práctica" y filtrarla
 * en todas partes, pero eso significa meter un filtro nuevo en cada consulta que
 * suma plata — justo donde ya se nos habían colado errores. Sin escritura no hay
 * nada que filtrar ni que limpiar después, y la caja no corre ningún riesgo.
 */

async function empresaDelUsuario(): Promise<string | null> {
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
  return data?.empresa_id ?? null;
}

async function cambiarPractica(valor: boolean): Promise<{ ok: boolean; error?: string }> {
  const empresaId = await empresaDelUsuario();
  if (!empresaId) return { ok: false, error: 'No autenticado' };

  const { error } = await createAdminClient()
    .from('empresas')
    .update({ modo_practica: valor, updated_at: new Date().toISOString() })
    .eq('id', empresaId);
  if (error) {
    return { ok: false, error: 'No pudimos cambiarlo. ¿Corriste la migración 016?' };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

/** "Ya entendí, empezar de verdad": a partir de aquí las ventas sí se guardan. */
export async function terminarPractica() {
  return cambiarPractica(false);
}

/** Volver a practicar (por ejemplo, para enseñarle a un empleado nuevo). */
export async function volverAPracticar() {
  return cambiarPractica(true);
}

/** Marca que el dueño ya vio los globos de la pantalla de vender. */
export async function marcarGuiaPosVista(): Promise<void> {
  const empresaId = await empresaDelUsuario();
  if (!empresaId) return;
  await createAdminClient()
    .from('empresas')
    .update({ guia_pos_vista: true })
    .eq('id', empresaId);
}

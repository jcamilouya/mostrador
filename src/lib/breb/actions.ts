'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { descontarIngredientesPorVenta } from '@/lib/insumos/consumo';
import { configuracionSchema } from './schemas';

export type ConfigState = { ok?: boolean; error?: string };

async function getEmpresaIdValidado(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  return usuario?.empresa_id ?? null;
}

export async function guardarConfiguracion(
  _prev: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = configuracionSchema.safeParse({
    nombre: formData.get('nombre'),
    telefono: formData.get('telefono') ?? '',
    direccion: formData.get('direccion') ?? '',
    breb_llave: formData.get('breb_llave') ?? '',
    breb_banco: formData.get('breb_banco') ?? '',
    breb_merchant_id: formData.get('breb_merchant_id') ?? '',
    breb_qr_payload: formData.get('breb_qr_payload') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const d = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from('empresas')
    .update({
      nombre: d.nombre,
      telefono: d.telefono || null,
      direccion: d.direccion || null,
      breb_llave: d.breb_llave || null,
      breb_banco: d.breb_banco || null,
      breb_merchant_id: d.breb_merchant_id || null,
      breb_qr_payload: d.breb_qr_payload || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', empresaId);

  if (error) return { error: 'No pudimos guardar los cambios. Intenta de nuevo.' };

  revalidatePath('/dashboard/configuracion');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

export type ConfirmarResult = { ok: true } | { ok: false; error: string };

/**
 * Confirma manualmente una venta Bre-B pendiente: la marca completada y
 * descuenta el stock de sus productos (el descuento no se hizo al crearla).
 */
export async function confirmarVentaBreb(ventaId: string): Promise<ConfirmarResult> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { ok: false, error: 'No autenticado' };

  const admin = createAdminClient();

  const { data: venta } = await admin
    .from('ventas')
    .select('id, numero_venta, estado, empresa_id')
    .eq('id', ventaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (!venta) return { ok: false, error: 'Venta no encontrada' };
  if (venta.estado === 'completada') return { ok: true }; // ya estaba confirmada
  if (venta.estado !== 'pendiente') {
    return { ok: false, error: 'Esta venta no se puede confirmar' };
  }

  const { data: items } = await admin
    .from('venta_items')
    .select('producto_id, cantidad')
    .eq('venta_id', ventaId);

  const { error: updErr } = await admin
    .from('ventas')
    .update({ estado: 'completada' })
    .eq('id', ventaId)
    .eq('empresa_id', empresaId);
  if (updErr) return { ok: false, error: 'No pudimos confirmar la venta.' };

  for (const it of items ?? []) {
    if (!it.producto_id) continue;
    const { data: prod } = await admin
      .from('productos')
      .select('stock_actual')
      .eq('id', it.producto_id)
      .eq('empresa_id', empresaId)
      .single();
    const stockNuevo = Math.max(0, (prod?.stock_actual ?? 0) - it.cantidad);
    await admin
      .from('productos')
      .update({ stock_actual: stockNuevo, updated_at: new Date().toISOString() })
      .eq('id', it.producto_id)
      .eq('empresa_id', empresaId);
    await admin.from('movimientos_inventario').insert({
      empresa_id: empresaId,
      producto_id: it.producto_id,
      tipo: 'salida',
      cantidad: it.cantidad,
      referencia_tipo: 'venta',
      referencia_id: ventaId,
      notas: `Venta #${venta.numero_venta} (Bre-B confirmada)`,
    });
  }

  // Descontar ingredientes de la venta confirmada (según recetas).
  await descontarIngredientesPorVenta(
    admin,
    empresaId,
    ventaId,
    venta.numero_venta,
    (items ?? [])
      .filter((it) => it.producto_id)
      .map((it) => ({ producto_id: it.producto_id as string, cantidad: it.cantidad })),
  );

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/inventario');
  return { ok: true };
}

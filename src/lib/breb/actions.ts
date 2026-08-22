'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  descontarStockProductosPorVenta,
} from '@/lib/insumos/consumo';
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

  // Recargo por tarjeta: entre 0 y 20%, en pasos de lo que escriba el negocio.
  const recargoBruto = Number(formData.get('recargo_tarjeta_pct') ?? 0);
  const recargoTarjeta = Number.isFinite(recargoBruto)
    ? Math.min(20, Math.max(0, recargoBruto))
    : 0;

  const admin = createAdminClient();
  const cambios: Record<string, unknown> = {
    nombre: d.nombre,
    telefono: d.telefono || null,
    direccion: d.direccion || null,
    breb_llave: d.breb_llave || null,
    breb_banco: d.breb_banco || null,
    breb_merchant_id: d.breb_merchant_id || null,
    breb_qr_payload: d.breb_qr_payload || null,
    recargo_tarjeta_pct: recargoTarjeta,
    updated_at: new Date().toISOString(),
  };

  let { error } = await admin.from('empresas').update(cambios).eq('id', empresaId);

  // Sin la migración 013 la columna del recargo no existe: guardar el resto.
  if (error?.code === '42703') {
    delete cambios.recargo_tarjeta_pct;
    ({ error } = await admin.from('empresas').update(cambios).eq('id', empresaId));
  }

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

  // Bebidas elegidas por línea. Consulta aparte: si la columna aún no existe
  // (migración 008 sin correr), degrada a ninguna sin romper la confirmación.
  const { data: bebidaItems } = await admin
    .from('venta_items')
    .select('insumo_extra_id, cantidad')
    .eq('venta_id', ventaId)
    .not('insumo_extra_id', 'is', null);

  // UPDATE condicional: solo completa si SIGUE pendiente. Si el webhook de
  // Bancolombia (u otra pestaña) la confirmó primero, no volvemos a descontar.
  const { data: completadas, error: updErr } = await admin
    .from('ventas')
    .update({ estado: 'completada' })
    .eq('id', ventaId)
    .eq('empresa_id', empresaId)
    .eq('estado', 'pendiente')
    .select('id');
  if (updErr) return { ok: false, error: 'No pudimos confirmar la venta.' };
  if (!completadas || completadas.length === 0) return { ok: true }; // ya estaba confirmada

  await descontarStockProductosPorVenta(
    admin,
    empresaId,
    ventaId,
    venta.numero_venta,
    (items ?? [])
      .filter((it) => it.producto_id)
      .map((it) => ({ producto_id: it.producto_id as string, cantidad: it.cantidad })),
  );

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

  // Descontar las bebidas elegidas en las líneas de la venta.
  await descontarInsumosVendidos(
    admin,
    empresaId,
    ventaId,
    venta.numero_venta,
    (bebidaItems ?? []).map((it) => ({
      insumo_id: it.insumo_extra_id as string,
      cantidad: it.cantidad,
    })),
  );

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/inventario');
  // La venta también descuenta ingredientes y bebidas del Inventario.
  revalidatePath('/dashboard/insumos');
  revalidatePath('/dashboard/ingresos');
  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { devolverIngredientesPorVenta, devolverInsumosVendidos } from '@/lib/insumos/consumo';

export type VentaItemDetalle = {
  id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export type VentaDetalle = {
  id: string;
  numero_venta: number;
  subtotal: number;
  iva: number;
  total: number;
  metodo_pago: string;
  estado: string;
  created_at: string;
  items: VentaItemDetalle[];
};

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

/** Detalle completo de una venta (con sus items) para el modal. */
export async function getVentaDetalle(ventaId: string): Promise<VentaDetalle | null> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('ventas')
    .select(
      'id, numero_venta, subtotal, iva, total, metodo_pago, estado, created_at, venta_items (id, nombre_producto, cantidad, precio_unitario, subtotal)',
    )
    .eq('id', ventaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (!data) return null;

  const items = (Array.isArray(data.venta_items) ? data.venta_items : []).map((i) => ({
    id: i.id,
    nombre_producto: i.nombre_producto,
    cantidad: Number(i.cantidad) || 0,
    precio_unitario: Number(i.precio_unitario) || 0,
    subtotal: Number(i.subtotal) || 0,
  }));

  return {
    id: data.id,
    numero_venta: data.numero_venta,
    subtotal: Number(data.subtotal) || 0,
    iva: Number(data.iva) || 0,
    total: Number(data.total) || 0,
    metodo_pago: data.metodo_pago,
    estado: data.estado,
    created_at: data.created_at,
    items,
  };
}

export type AnularResult = { ok: true } | { ok: false; error: string };

/**
 * Anula una venta: la marca 'cancelada' y RESTAURA el stock de cada producto
 * que ya se había descontado. Sin esto el inventario quedaría mentiroso.
 */
export async function anularVenta(ventaId: string): Promise<AnularResult> {
  const empresaId = await getEmpresaIdValidado();
  if (!empresaId) return { ok: false, error: 'No autenticado' };

  const admin = createAdminClient();

  const { data: venta } = await admin
    .from('ventas')
    .select('id, numero_venta, estado, empresa_id, venta_items (producto_id, cantidad)')
    .eq('id', ventaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (!venta) return { ok: false, error: 'Venta no encontrada' };
  if (venta.estado === 'cancelada') return { ok: true }; // ya estaba anulada

  // Solo restauramos stock si la venta había descontado inventario.
  // Las ventas 'pendiente' (Bre-B sin confirmar) nunca descontaron stock.
  const restaurarStock = venta.estado === 'completada';

  const { error: updErr } = await admin
    .from('ventas')
    .update({ estado: 'cancelada' })
    .eq('id', ventaId)
    .eq('empresa_id', empresaId);
  if (updErr) return { ok: false, error: 'No pudimos anular la venta.' };

  if (restaurarStock) {
    const items = Array.isArray(venta.venta_items) ? venta.venta_items : [];
    for (const it of items) {
      if (!it.producto_id) continue;
      const cantidad = Number(it.cantidad) || 0;
      const { data: prod } = await admin
        .from('productos')
        .select('stock_actual')
        .eq('id', it.producto_id)
        .eq('empresa_id', empresaId)
        .single();
      const stockNuevo = (prod?.stock_actual ?? 0) + cantidad;
      await admin
        .from('productos')
        .update({ stock_actual: stockNuevo, updated_at: new Date().toISOString() })
        .eq('id', it.producto_id)
        .eq('empresa_id', empresaId);
      await admin.from('movimientos_inventario').insert({
        empresa_id: empresaId,
        producto_id: it.producto_id,
        tipo: 'entrada',
        cantidad,
        referencia_tipo: 'anulacion',
        referencia_id: ventaId,
        notas: `Anulación venta #${venta.numero_venta} (stock restaurado)`,
      });
    }

    // Devolver también los ingredientes que había consumido la venta.
    await devolverIngredientesPorVenta(
      admin,
      empresaId,
      ventaId,
      venta.numero_venta,
      items
        .filter((it) => it.producto_id)
        .map((it) => ({ producto_id: it.producto_id as string, cantidad: Number(it.cantidad) || 0 })),
    );

    // Devolver las bebidas elegidas (degrada si falta la migración 008).
    const { data: bebidaItems } = await admin
      .from('venta_items')
      .select('insumo_extra_id, cantidad')
      .eq('venta_id', ventaId)
      .not('insumo_extra_id', 'is', null);
    await devolverInsumosVendidos(
      admin,
      empresaId,
      ventaId,
      venta.numero_venta,
      (bebidaItems ?? []).map((it) => ({
        insumo_id: it.insumo_extra_id as string,
        cantidad: Number(it.cantidad) || 0,
      })),
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/ingresos');
  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/insumos');
  return { ok: true };
}

/**
 * Helpers server-side (NO son server actions) para mover stock según las
 * recetas y las bebidas. Se importan desde las acciones de POS/Bre-B/productos.
 *
 * El stock se mueve con las funciones SQL atómicas `ajustar_stock_*`
 * (migración 011) para evitar carreras entre ventas simultáneas. Si esas
 * funciones aún no existen (migración sin correr), degradan a read-modify-write.
 */
import { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;
type ItemVendido = { producto_id: string; cantidad: number };

/** Ajusta el stock de un PRODUCTO en +/- delta, atómico (con fallback). */
export async function ajustarStockProducto(
  admin: Admin,
  empresaId: string,
  productoId: string,
  delta: number,
): Promise<void> {
  const { error } = await admin.rpc('ajustar_stock_producto', {
    p_id: productoId,
    p_empresa_id: empresaId,
    p_delta: delta,
  });
  if (!error) return;
  // Fallback (migración 011 sin correr): read-modify-write.
  const { data } = await admin
    .from('productos')
    .select('stock_actual')
    .eq('id', productoId)
    .eq('empresa_id', empresaId)
    .single();
  const nuevo = Math.max(0, (Number(data?.stock_actual) || 0) + delta);
  await admin
    .from('productos')
    .update({ stock_actual: nuevo, updated_at: new Date().toISOString() })
    .eq('id', productoId)
    .eq('empresa_id', empresaId);
}

/** Ajusta el stock de un INSUMO en +/- delta, atómico (con fallback). */
export async function ajustarStockInsumo(
  admin: Admin,
  empresaId: string,
  insumoId: string,
  delta: number,
): Promise<void> {
  const { error } = await admin.rpc('ajustar_stock_insumo', {
    p_id: insumoId,
    p_empresa_id: empresaId,
    p_delta: delta,
  });
  if (!error) return;
  const { data } = await admin
    .from('insumos')
    .select('stock_actual')
    .eq('id', insumoId)
    .eq('empresa_id', empresaId)
    .single();
  const nuevo = Math.max(0, (Number(data?.stock_actual) || 0) + delta);
  await admin
    .from('insumos')
    .update({ stock_actual: nuevo, updated_at: new Date().toISOString() })
    .eq('id', insumoId)
    .eq('empresa_id', empresaId);
}

async function movInsumo(
  admin: Admin,
  empresaId: string,
  insumoId: string,
  tipo: 'salida' | 'entrada',
  cantidad: number,
  ventaId: string,
  notas: string,
): Promise<void> {
  await admin.from('movimientos_insumos').insert({
    empresa_id: empresaId,
    insumo_id: insumoId,
    tipo,
    cantidad,
    referencia_tipo: 'venta',
    referencia_id: ventaId,
    notas,
  });
}

/** Suma el consumo de insumos de una lista de items vendidos (insumo_id → cantidad). */
async function calcularConsumo(
  admin: Admin,
  empresaId: string,
  items: ItemVendido[],
): Promise<Map<string, number>> {
  const productoIds = [...new Set(items.map((i) => i.producto_id))];
  const consumo = new Map<string, number>();
  if (productoIds.length === 0) return consumo;

  const { data: recetas } = await admin
    .from('producto_receta')
    .select('producto_id, insumo_id, cantidad')
    .eq('empresa_id', empresaId)
    .in('producto_id', productoIds);
  if (!recetas || recetas.length === 0) return consumo;

  for (const item of items) {
    for (const linea of recetas.filter((r) => r.producto_id === item.producto_id)) {
      const necesita = (Number(linea.cantidad) || 0) * item.cantidad;
      consumo.set(linea.insumo_id, (consumo.get(linea.insumo_id) ?? 0) + necesita);
    }
  }
  return consumo;
}

/** Descuenta del stock los ingredientes que consumió una venta (según recetas). */
export async function descontarIngredientesPorVenta(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  items: ItemVendido[],
): Promise<void> {
  const consumo = await calcularConsumo(admin, empresaId, items);
  for (const [insumoId, cantidad] of consumo) {
    if (cantidad <= 0) continue;
    await ajustarStockInsumo(admin, empresaId, insumoId, -cantidad);
    await movInsumo(admin, empresaId, insumoId, 'salida', cantidad, ventaId, `Venta #${numeroVenta}`);
  }
}

/** Devuelve al stock los ingredientes de una venta anulada. */
export async function devolverIngredientesPorVenta(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  items: ItemVendido[],
): Promise<void> {
  const consumo = await calcularConsumo(admin, empresaId, items);
  for (const [insumoId, cantidad] of consumo) {
    if (cantidad <= 0) continue;
    await ajustarStockInsumo(admin, empresaId, insumoId, cantidad);
    await movInsumo(admin, empresaId, insumoId, 'entrada', cantidad, ventaId, `Venta #${numeroVenta} anulada`);
  }
}

type BebidaVendida = { insumo_id: string; cantidad: number };

/** Descuenta bebidas (u otros insumos) elegidas directamente en la venta. */
export async function descontarInsumosVendidos(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  bebidas: BebidaVendida[],
): Promise<void> {
  for (const b of bebidas) {
    if (!b.insumo_id || b.cantidad <= 0) continue;
    await ajustarStockInsumo(admin, empresaId, b.insumo_id, -b.cantidad);
    await movInsumo(admin, empresaId, b.insumo_id, 'salida', b.cantidad, ventaId, `Venta #${numeroVenta} (bebida)`);
  }
}

/** Devuelve al stock las bebidas de una venta anulada. */
export async function devolverInsumosVendidos(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  bebidas: BebidaVendida[],
): Promise<void> {
  for (const b of bebidas) {
    if (!b.insumo_id || b.cantidad <= 0) continue;
    await ajustarStockInsumo(admin, empresaId, b.insumo_id, b.cantidad);
    await movInsumo(admin, empresaId, b.insumo_id, 'entrada', b.cantidad, ventaId, `Venta #${numeroVenta} anulada (bebida devuelta)`);
  }
}

/** Reemplaza la receta de un producto por el set de líneas dado (idempotente). */
export async function reemplazarReceta(
  admin: Admin,
  empresaId: string,
  productoId: string,
  lineas: { insumo_id: string; cantidad: number }[],
): Promise<void> {
  await admin
    .from('producto_receta')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('producto_id', productoId);

  const filas = lineas
    .filter((l) => l.insumo_id && l.cantidad > 0)
    .map((l) => ({
      empresa_id: empresaId,
      producto_id: productoId,
      insumo_id: l.insumo_id,
      cantidad: l.cantidad,
    }));
  if (filas.length > 0) {
    await admin.from('producto_receta').insert(filas);
  }
}

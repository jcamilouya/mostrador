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

async function movProducto(
  admin: Admin,
  empresaId: string,
  productoId: string,
  tipo: 'salida' | 'entrada',
  cantidad: number,
  ventaId: string,
  referenciaTipo: string,
  notas: string,
): Promise<void> {
  await admin.from('movimientos_inventario').insert({
    empresa_id: empresaId,
    producto_id: productoId,
    tipo,
    cantidad,
    referencia_tipo: referenciaTipo,
    referencia_id: ventaId,
    notas,
  });
}

/** Mapa producto_id → insumo_id (el link de bebida con stock único), o null. */
async function mapaProductoInsumo(
  admin: Admin,
  empresaId: string,
  items: ItemVendido[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(items.map((i) => i.producto_id))];
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  // Si la columna insumo_id aún no existe (migración 012 sin correr), la query
  // falla y el mapa queda vacío → todo se trata como producto normal.
  const { data } = await admin
    .from('productos')
    .select('id, insumo_id')
    .eq('empresa_id', empresaId)
    .in('id', ids);
  for (const p of data ?? []) {
    map.set(p.id as string, ((p as Record<string, unknown>).insumo_id as string) ?? null);
  }
  return map;
}

/** IDs de los productos que se PREPARAN (tienen receta): su stock son los ingredientes. */
async function productosConReceta(
  admin: Admin,
  empresaId: string,
  items: ItemVendido[],
): Promise<Set<string>> {
  const ids = [...new Set(items.map((i) => i.producto_id))];
  if (ids.length === 0) return new Set();
  const { data } = await admin
    .from('producto_receta')
    .select('producto_id')
    .eq('empresa_id', empresaId)
    .in('producto_id', ids);
  return new Set((data ?? []).map((r) => r.producto_id as string));
}

/**
 * Descuenta el stock de los PRODUCTOS de una venta. Tres casos:
 * - Producto conectado a un insumo (bebida): descuenta el insumo.
 * - Producto CON RECETA: no toca stock propio — sus ingredientes se descuentan
 *   en `descontarIngredientesPorVenta`. Si no, se contaría el mismo consumo dos
 *   veces y el plato se "agotaría" con la nevera llena.
 * - Producto normal: descuenta su propio stock.
 */
export async function descontarStockProductosPorVenta(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  items: ItemVendido[],
): Promise<void> {
  const linkMap = await mapaProductoInsumo(admin, empresaId, items);
  const conReceta = await productosConReceta(admin, empresaId, items);
  for (const it of items) {
    if (!it.producto_id || it.cantidad <= 0) continue;
    const insumoId = linkMap.get(it.producto_id);
    if (insumoId) {
      await ajustarStockInsumo(admin, empresaId, insumoId, -it.cantidad);
      await movInsumo(admin, empresaId, insumoId, 'salida', it.cantidad, ventaId, `Venta #${numeroVenta}`);
    } else if (conReceta.has(it.producto_id)) {
      continue;
    } else {
      await ajustarStockProducto(admin, empresaId, it.producto_id, -it.cantidad);
      await movProducto(admin, empresaId, it.producto_id, 'salida', it.cantidad, ventaId, 'venta', `Venta #${numeroVenta}`);
    }
  }
}

/** Devuelve el stock de los productos de una venta anulada (mismos tres casos). */
export async function devolverStockProductosPorVenta(
  admin: Admin,
  empresaId: string,
  ventaId: string,
  numeroVenta: number | string,
  items: ItemVendido[],
): Promise<void> {
  const linkMap = await mapaProductoInsumo(admin, empresaId, items);
  const conReceta = await productosConReceta(admin, empresaId, items);
  for (const it of items) {
    if (!it.producto_id || it.cantidad <= 0) continue;
    const insumoId = linkMap.get(it.producto_id);
    if (insumoId) {
      await ajustarStockInsumo(admin, empresaId, insumoId, it.cantidad);
      await movInsumo(admin, empresaId, insumoId, 'entrada', it.cantidad, ventaId, `Venta #${numeroVenta} anulada`);
    } else if (conReceta.has(it.producto_id)) {
      continue;
    } else {
      await ajustarStockProducto(admin, empresaId, it.producto_id, it.cantidad);
      await movProducto(admin, empresaId, it.producto_id, 'entrada', it.cantidad, ventaId, 'anulacion', `Anulación venta #${numeroVenta} (stock restaurado)`);
    }
  }
}

/**
 * Costo real de preparar 1 unidad de cada producto con receta
 * (Σ cantidad × costo del insumo). Se usa como costo de venta: si no, un plato
 * con `precio_compra` en 0 reporta 100% de ganancia, que fue lo que pasó con
 * las hamburguesas.
 */
export async function costosDeReceta(
  admin: Admin,
  empresaId: string,
  productoIds: string[],
): Promise<Map<string, number>> {
  const costos = new Map<string, number>();
  const ids = [...new Set(productoIds)];
  if (ids.length === 0) return costos;

  const { data } = await admin
    .from('producto_receta')
    .select('producto_id, cantidad, insumos ( costo_unitario )')
    .eq('empresa_id', empresaId)
    .in('producto_id', ids);

  for (const r of data ?? []) {
    const ins = (r as Record<string, unknown>).insumos as Record<string, unknown> | null;
    const parcial = (Number(r.cantidad) || 0) * (Number(ins?.costo_unitario) || 0);
    const pid = r.producto_id as string;
    costos.set(pid, (costos.get(pid) ?? 0) + parcial);
  }
  return costos;
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

  // Si el producto está conectado a un insumo (stock único), ese insumo ya se
  // descontó como stock del producto: no volverlo a descontar por la receta.
  const linkMap = await mapaProductoInsumo(admin, empresaId, items);

  for (const item of items) {
    const propio = linkMap.get(item.producto_id);
    for (const linea of recetas.filter((r) => r.producto_id === item.producto_id)) {
      if (propio && linea.insumo_id === propio) continue;
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

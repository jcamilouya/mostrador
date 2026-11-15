import type { CartItem } from '@/lib/pos/types';
import { calcularLineId } from '@/stores/cart-store';
import type { CuentaAbierta } from './queries';

/**
 * Convierte las líneas guardadas de una cuenta en líneas del carrito.
 *
 * Conserva la opción (`variante`), la bebida y la nota, y arma el `lineId` con
 * la MISMA regla del carrito: así, si el mesero vuelve a tocar "Hamburguesa ·
 * Combo", se suma a esa línea en vez de crear otra, y el servidor cobra el
 * precio del combo y no el del sencillo.
 *
 * Una línea marchada a medias viene en dos filas (lo que ya está en cocina y
 * lo nuevo): aquí se juntan en una, y `enCocina` dice cuántas ya salieron.
 */
export function lineasParaCarrito(cuenta: CuentaAbierta): CartItem[] {
  const porLinea = new Map<string, CartItem>();
  for (const i of cuenta.items) {
    if (!i.producto_id) continue;
    const base = {
      producto_id: i.producto_id,
      variante: i.variante,
      insumo_extra_id: i.insumo_extra_id,
      nota: i.nota,
    };
    const lineId = calcularLineId(base);
    const ya = porLinea.get(lineId);
    const enCocina = i.marchado ? i.cantidad : 0;
    if (ya) {
      porLinea.set(lineId, {
        ...ya,
        cantidad: ya.cantidad + i.cantidad,
        enCocina: (ya.enCocina ?? 0) + enCocina,
      });
      continue;
    }
    porLinea.set(lineId, {
      ...base,
      lineId,
      nombre: i.nombre_producto,
      precio_venta: i.precio_unitario,
      precio_compra: i.precio_compra,
      cantidad: i.cantidad,
      enCocina,
      // La cuenta ya existe: no volvemos a topar por stock al retomarla.
      stock_disponible: Number.POSITIVE_INFINITY,
    });
  }
  return [...porLinea.values()];
}

/** Cuántas unidades de la cuenta faltan por mandar a cocina. */
export function sinMarchar(cuenta: CuentaAbierta): number {
  return cuenta.items.filter((i) => !i.marchado).reduce((a, i) => a + i.cantidad, 0);
}

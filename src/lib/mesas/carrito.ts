import type { CartItem } from '@/lib/pos/types';
import { calcularLineId } from '@/stores/cart-store';
import type { CuentaAbierta } from './queries';

/**
 * Convierte las líneas guardadas de una cuenta en líneas del carrito.
 *
 * Conserva la opción (`variante`) y la bebida, y arma el `lineId` con la MISMA
 * regla del carrito: así, si el mesero vuelve a tocar "Hamburguesa · Combo",
 * se suma a esa línea en vez de crear otra, y el servidor cobra el precio del
 * combo y no el del sencillo.
 */
export function lineasParaCarrito(cuenta: CuentaAbierta): CartItem[] {
  const lineas = cuenta.items
    .filter((i) => i.producto_id)
    .map((i): CartItem => {
      const base = {
        producto_id: i.producto_id as string,
        variante: i.variante,
        insumo_extra_id: i.insumo_extra_id,
      };
      return {
        ...base,
        lineId: calcularLineId(base),
        nombre: i.nombre_producto,
        precio_venta: i.precio_unitario,
        precio_compra: i.precio_compra,
        cantidad: i.cantidad,
        // La cuenta ya existe: no volvemos a topar por stock al retomarla.
        stock_disponible: Number.POSITIVE_INFINITY,
      };
    });

  // Dos filas con la misma línea (cuentas viejas) se suman en una sola: el
  // carrito no admite dos líneas con el mismo lineId.
  const porLinea = new Map<string, CartItem>();
  for (const l of lineas) {
    const ya = porLinea.get(l.lineId);
    porLinea.set(l.lineId, ya ? { ...ya, cantidad: ya.cantidad + l.cantidad } : l);
  }
  return [...porLinea.values()];
}

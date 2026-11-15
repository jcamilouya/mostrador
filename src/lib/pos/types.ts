export type CartItem = {
  // Identifica la línea del carrito. Es producto_id, o producto_id::variante
  // (+ ::bebida si se eligió una), para que dos combinaciones del mismo
  // producto sean líneas distintas.
  lineId: string;
  producto_id: string;
  nombre: string;
  // Nombre de la opción/combo elegida (null = producto sencillo).
  variante?: string | null;
  // Bebida del Inventario elegida para esta línea (módulo Bebidas).
  insumo_extra_id?: string | null;
  precio_venta: number;
  precio_compra: number;
  cantidad: number;
  stock_disponible: number;
  categoria_color?: string | null;
  /** "Sin cebolla"… (023). Dos notas distintas = dos líneas. */
  nota?: string | null;
  /** Cuántas de esta línea ya están en cocina (solo para mostrarlo). */
  enCocina?: number;
};

export type MetodoPago = 'efectivo' | 'breb' | 'transferencia' | 'mixto' | 'tarjeta';

export type VentaResult =
  | { ok: true; ventaId: string; numero: number; total: number; comanda?: number | null }
  | { ok: false; error: string };

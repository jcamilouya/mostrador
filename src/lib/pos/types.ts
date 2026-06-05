export type CartItem = {
  producto_id: string;
  nombre: string;
  precio_venta: number;
  precio_compra: number;
  cantidad: number;
  stock_disponible: number;
  categoria_color?: string | null;
};

export type MetodoPago = 'efectivo' | 'breb' | 'transferencia' | 'mixto';

export type VentaResult =
  | { ok: true; ventaId: string; numero: number; total: number }
  | { ok: false; error: string };

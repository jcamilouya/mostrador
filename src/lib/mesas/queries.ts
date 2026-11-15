import { createClient } from '@/lib/supabase/server';
import { normalizarVariantes } from '@/lib/inventario/queries';

export type LineaCuenta = {
  producto_id: string | null;
  nombre_producto: string;
  /**
   * La opción/combo de la línea ("Combo", "De coco"), o null si es sencillo.
   * `venta_items` no la guarda aparte: se recupera del nombre. Sin esto, al
   * retomar la mesa el carrito la mandaba como sencillo y el servidor le
   * ponía el precio base: un combo de $25.000 se cobraba a $18.000.
   */
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
  precio_compra: number;
  insumo_extra_id: string | null;
};

export type CuentaAbierta = {
  id: string;
  numero_venta: number;
  mesa: string;
  /** La mesa del plano (migración 021), o null si es una etiqueta libre. */
  mesaId: string | null;
  /** Cuándo pidieron la cuenta: la mesa queda "por cobrar". */
  pedidaEn: string | null;
  total: number;
  abiertaDesde: string;
  /** El cliente asociado a la cuenta, si el mesero lo eligió al abrirla. */
  cliente: { id: string; nombre: string; telefono: string | null } | null;
  items: LineaCuenta[];
};

const ITEMS =
  'venta_items (producto_id, nombre_producto, cantidad, precio_unitario, precio_compra, insumo_extra_id, productos (nombre, variantes))';
const ITEMS_SIMPLE =
  'venta_items (producto_id, nombre_producto, cantidad, precio_unitario, precio_compra, insumo_extra_id)';
const BASE = 'id, numero_venta, mesa, total, created_at, cliente_id, clientes (nombre, telefono)';

/**
 * De la más completa a la más simple. Si una falla (falta la migración 021, o
 * el embed de productos no resuelve) se prueba la siguiente: la pantalla de
 * Mesas NUNCA debe quedar vacía con cuentas abiertas de verdad.
 */
const CONSULTAS = [
  `${BASE}, mesa_id, cuenta_pedida_en, ${ITEMS}`,
  `${BASE}, ${ITEMS}`,
  `${BASE}, ${ITEMS_SIMPLE}`,
];

/**
 * Qué opción tiene la línea, comparando su nombre con las opciones del
 * producto. El POS la nombra "Producto · Opción" (+ " (Bebida)" si eligió una).
 */
function varianteDeLinea(nombreLinea: string, producto: unknown): string | null {
  const p = (Array.isArray(producto) ? producto[0] : producto) as
    | { nombre?: string; variantes?: unknown }
    | null
    | undefined;
  if (!p?.nombre) return null;
  for (const v of normalizarVariantes(p.variantes)) {
    const base = `${p.nombre} · ${v.nombre}`;
    if (nombreLinea === base || nombreLinea.startsWith(`${base} (`)) return v.nombre;
  }
  return null;
}

/**
 * Las cuentas que están abiertas ahora mismo (mesas con pedido sin cobrar).
 * Devuelve `[]` si aún no existe la columna `mesa` (migración 014 sin correr),
 * y funciona sin `mesa_id` (021), así que es seguro desplegar antes de correrlas.
 */
export async function getCuentasAbiertas(empresaId: string): Promise<CuentaAbierta[]> {
  const supabase = await createClient();
  const consultar = (campos: string) =>
    supabase
      .from('ventas')
      .select(campos)
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierta')
      .order('created_at', { ascending: true });

  let data: unknown[] | null = null;
  for (const campos of CONSULTAS) {
    const res = await consultar(campos);
    if (!res.error && res.data) {
      data = res.data;
      break;
    }
  }
  if (!data) return [];

  return (data as unknown as Record<string, unknown>[]).map((v) => ({
    id: v.id as string,
    numero_venta: v.numero_venta as number,
    mesa: (v.mesa as string) || `Cuenta #${v.numero_venta}`,
    mesaId: (v.mesa_id as string | null) ?? null,
    pedidaEn: (v.cuenta_pedida_en as string | null) ?? null,
    total: Number(v.total) || 0,
    abiertaDesde: v.created_at as string,
    cliente: (() => {
      const id = v.cliente_id as string | null;
      if (!id) return null;
      type Rel = { nombre?: string; telefono?: string | null };
      const rel = v.clientes as Rel | Rel[] | null;
      const fila = Array.isArray(rel) ? rel[0] : rel;
      return {
        id,
        nombre: fila?.nombre ?? 'Cliente',
        telefono: fila?.telefono ?? null,
      };
    })(),
    items: (Array.isArray(v.venta_items) ? (v.venta_items as Record<string, unknown>[]) : []).map(
      (i) => ({
        producto_id: (i.producto_id as string) ?? null,
        nombre_producto: i.nombre_producto as string,
        variante: varianteDeLinea(i.nombre_producto as string, i.productos),
        cantidad: Number(i.cantidad) || 0,
        precio_unitario: Number(i.precio_unitario) || 0,
        precio_compra: Number(i.precio_compra) || 0,
        insumo_extra_id: (i.insumo_extra_id as string) ?? null,
      }),
    ),
  }));
}

/** Cuántas cuentas hay abiertas — para el aviso del POS y del menú. */
export async function contarCuentasAbiertas(empresaId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('ventas')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta');
  if (error) return 0;
  return count ?? 0;
}

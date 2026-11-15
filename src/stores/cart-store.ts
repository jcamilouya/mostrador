'use client';

import { create } from 'zustand';
import type { CartItem } from '@/lib/pos/types';

type ClienteSel = { id: string; nombre: string; telefono: string | null };

type CartState = {
  items: CartItem[];
  cliente: ClienteSel | null;
  /** Si el carrito viene de una cuenta abierta (mesa), su id. */
  cuentaId: string | null;
  /** Etiqueta de esa cuenta: "Mesa 4", "Para llevar"… */
  mesa: string | null;
  /** Mesa del plano del salón (migración 021). Con ella no se pregunta "¿a qué mesa?". */
  mesaId: string | null;
  /** Al llegar al POS, abrir el cobro de una vez (tocaron "Cobrar" en el plano). */
  cobrarAlAbrir: boolean;
  /** Cómo estaba la cuenta al cargarla (ver `lib/mesas/huella.ts`). */
  huella: string | null;
  add: (item: Omit<CartItem, 'cantidad' | 'lineId'>) => void;
  setCantidad: (lineId: string, cantidad: number) => void;
  remove: (lineId: string) => void;
  setCliente: (cliente: ClienteSel | null) => void;
  /** Carga una cuenta abierta en el carrito para seguirle agregando. */
  cargarCuenta: (cuenta: {
    id: string;
    mesa: string;
    mesaId?: string | null;
    items: CartItem[];
    cliente?: ClienteSel | null;
    cobrar?: boolean;
    huella?: string | null;
  }) => void;
  /** Empieza un pedido nuevo en una mesa libre del plano. */
  prepararMesa: (mesa: { id: string; nombre: string }) => void;
  setCobrarAlAbrir: (v: boolean) => void;
  setMesa: (mesa: string | null) => void;
  clear: () => void;
  total: () => number;
  totalItems: () => number;
};

// Una línea por producto + opción elegida (+ bebida elegida).
export function calcularLineId(item: {
  producto_id: string;
  variante?: string | null;
  insumo_extra_id?: string | null;
}): string {
  let id = item.variante ? `${item.producto_id}::${item.variante}` : item.producto_id;
  if (item.insumo_extra_id) id += `::b:${item.insumo_extra_id}`;
  return id;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  cliente: null,
  cuentaId: null,
  mesa: null,
  mesaId: null,
  cobrarAlAbrir: false,
  huella: null,
  add: (item) =>
    set((state) => {
      const lineId = calcularLineId(item);
      // Tope por PRODUCTO: la suma de todas sus líneas (opciones/bebidas) no
      // puede superar su stock. Evita sobrevender con varias líneas del mismo
      // producto (ej. 5 "Sencillo" + 5 "Combo" de un producto con 5 en stock).
      const yaDelProducto = state.items
        .filter((i) => i.producto_id === item.producto_id)
        .reduce((acc, i) => acc + i.cantidad, 0);
      if (yaDelProducto >= item.stock_disponible) return state;

      const existing = state.items.find((i) => i.lineId === lineId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, cantidad: i.cantidad + 1 } : i,
          ),
        };
      }
      return { items: [...state.items, { ...item, lineId, cantidad: 1 }] };
    }),
  setCantidad: (lineId, cantidad) =>
    set((state) => {
      if (cantidad <= 0) {
        return { items: state.items.filter((i) => i.lineId !== lineId) };
      }
      const linea = state.items.find((i) => i.lineId === lineId);
      if (!linea) return state;
      // Máximo para esta línea = stock del producto menos lo que ya tienen las
      // otras líneas del mismo producto.
      const otras = state.items
        .filter((i) => i.producto_id === linea.producto_id && i.lineId !== lineId)
        .reduce((acc, i) => acc + i.cantidad, 0);
      const max = Math.max(0, linea.stock_disponible - otras);
      return {
        items: state.items.map((i) =>
          i.lineId === lineId ? { ...i, cantidad: Math.min(cantidad, max) } : i,
        ),
      };
    }),
  remove: (lineId) =>
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),
  setCliente: (cliente) => set({ cliente }),
  // El cliente viaja con la cuenta: si se perdiera aquí, al volver a guardar la
  // mesa se sobreescribiría con null y la compra nunca llegaría a su historial.
  cargarCuenta: (cuenta) =>
    set({
      items: cuenta.items,
      cuentaId: cuenta.id,
      mesa: cuenta.mesa,
      mesaId: cuenta.mesaId ?? null,
      cliente: cuenta.cliente ?? null,
      cobrarAlAbrir: cuenta.cobrar === true,
      huella: cuenta.huella ?? null,
    }),
  // Lo que hubiera en el carrito se descarta: era de otra venta.
  prepararMesa: (mesa) =>
    set({
      items: [],
      cliente: null,
      cuentaId: null,
      mesa: mesa.nombre,
      mesaId: mesa.id,
      cobrarAlAbrir: false,
      huella: null,
    }),
  setCobrarAlAbrir: (v) => set({ cobrarAlAbrir: v }),
  setMesa: (mesa) => set({ mesa }),
  clear: () =>
    set({
      items: [],
      cliente: null,
      cuentaId: null,
      mesa: null,
      mesaId: null,
      cobrarAlAbrir: false,
      huella: null,
    }),
  total: () => get().items.reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0),
  totalItems: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
}));

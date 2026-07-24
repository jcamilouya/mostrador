'use client';

import { create } from 'zustand';
import type { CartItem } from '@/lib/pos/types';

type ClienteSel = { id: string; nombre: string; telefono: string | null };

type CartState = {
  items: CartItem[];
  cliente: ClienteSel | null;
  add: (item: Omit<CartItem, 'cantidad' | 'lineId'>) => void;
  setCantidad: (lineId: string, cantidad: number) => void;
  remove: (lineId: string) => void;
  setCliente: (cliente: ClienteSel | null) => void;
  clear: () => void;
  total: () => number;
  totalItems: () => number;
};

// Una línea por producto + opción elegida (+ bebida elegida).
function calcularLineId(item: {
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
  add: (item) =>
    set((state) => {
      const lineId = calcularLineId(item);
      const existing = state.items.find((i) => i.lineId === lineId);
      if (existing) {
        const nuevaCantidad = Math.min(existing.cantidad + 1, item.stock_disponible);
        return {
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, cantidad: nuevaCantidad } : i,
          ),
        };
      }
      if (item.stock_disponible <= 0) return state;
      return { items: [...state.items, { ...item, lineId, cantidad: 1 }] };
    }),
  setCantidad: (lineId, cantidad) =>
    set((state) => {
      if (cantidad <= 0) {
        return { items: state.items.filter((i) => i.lineId !== lineId) };
      }
      return {
        items: state.items.map((i) =>
          i.lineId === lineId
            ? { ...i, cantidad: Math.min(cantidad, i.stock_disponible) }
            : i,
        ),
      };
    }),
  remove: (lineId) =>
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),
  setCliente: (cliente) => set({ cliente }),
  clear: () => set({ items: [], cliente: null }),
  total: () => get().items.reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0),
  totalItems: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
}));

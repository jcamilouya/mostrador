'use client';

import { create } from 'zustand';
import type { CartItem } from '@/lib/pos/types';

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, 'cantidad'>) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  remove: (productoId: string) => void;
  clear: () => void;
  total: () => number;
  totalItems: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],
  add: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.producto_id === item.producto_id);
      if (existing) {
        const nuevaCantidad = Math.min(existing.cantidad + 1, item.stock_disponible);
        return {
          items: state.items.map((i) =>
            i.producto_id === item.producto_id ? { ...i, cantidad: nuevaCantidad } : i,
          ),
        };
      }
      if (item.stock_disponible <= 0) return state;
      return { items: [...state.items, { ...item, cantidad: 1 }] };
    }),
  setCantidad: (productoId, cantidad) =>
    set((state) => {
      if (cantidad <= 0) {
        return { items: state.items.filter((i) => i.producto_id !== productoId) };
      }
      return {
        items: state.items.map((i) =>
          i.producto_id === productoId
            ? { ...i, cantidad: Math.min(cantidad, i.stock_disponible) }
            : i,
        ),
      };
    }),
  remove: (productoId) =>
    set((state) => ({ items: state.items.filter((i) => i.producto_id !== productoId) })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0),
  totalItems: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
}));

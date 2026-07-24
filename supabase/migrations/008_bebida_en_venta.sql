-- ============================================
-- MIGRACIÓN: elección de bebida al vender
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- - productos.pide_bebida: el producto base ("Sencillo") pide elegir una
--   bebida del Inventario al venderlo. Las opciones/combos llevan su propio
--   flag dentro del JSONB `variantes` ({ nombre, precio, bebida: true }).
-- - venta_items.insumo_extra_id: la bebida (insumo) elegida en esa línea,
--   para descontarla/devolverla del módulo Bebidas y mostrarla en el recibo.
-- ============================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS pide_bebida BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS insumo_extra_id UUID
  REFERENCES insumos(id) ON DELETE SET NULL;

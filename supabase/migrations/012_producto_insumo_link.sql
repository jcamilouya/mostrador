-- ============================================
-- MIGRACIÓN: vincular un producto a un insumo (stock único)
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- Cuando una bebida del Inventario también se vende como producto, el producto
-- se enlaza al insumo con productos.insumo_id. A partir de ahí el STOCK es único:
-- la fuente de verdad es el insumo (Inventario). El producto muestra y descuenta
-- ese mismo stock. Los productos normales (insumo_id NULL) siguen igual.
-- ============================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS insumo_id UUID
  REFERENCES insumos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_insumo ON productos(insumo_id);

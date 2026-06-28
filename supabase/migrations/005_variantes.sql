-- =====================================================
-- Migración 005 — Opciones / combos por producto
-- =====================================================
-- Permite que un producto tenga varias presentaciones con su propio precio.
-- Ej: Hamburguesa → "Sola" (precio base), "Con papas", "Con papas y gaseosa".
--
-- Se guarda como JSONB: un arreglo de { "nombre": string, "precio": number }.
-- El precio base del producto (precio_venta) sigue siendo la opción "sencilla".
--
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS variantes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN productos.variantes IS
  'Opciones/combos del producto: [{ "nombre": "Con papas", "precio": 16000 }]';

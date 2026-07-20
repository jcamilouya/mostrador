-- ============================================
-- MIGRACIÓN: módulos de inventario en insumos
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- Convierte la sección de "insumos" en un Inventario con 4 módulos:
--   materia_prima | bebidas | confiteria | activos
-- Solo 'materia_prima' se conecta con las recetas de productos.
-- Los items existentes quedan como 'materia_prima' (eran ingredientes).
-- ============================================

ALTER TABLE insumos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'materia_prima';

CREATE INDEX IF NOT EXISTS idx_insumos_tipo ON insumos(empresa_id, tipo);

-- ============================================
-- MIGRACIÓN: inventario de ingredientes/insumos + recetas
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- Modelo:
--  - insumos: materia prima que se consume (pan, carne, tomate…), con su
--    unidad de trabajo (unidad|g|kg|lb|ml|L). El stock se guarda EN ESA unidad.
--  - producto_receta: qué ingredientes y cuánto consume 1 unidad de un producto.
--  - movimientos_insumos: historial (entradas por compra, salidas por venta,
--    ajustes por merma).
-- ============================================

CREATE TABLE IF NOT EXISTS insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'unidad',      -- unidad | g | kg | lb | ml | L
  stock_actual NUMERIC(14,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(14,3) NOT NULL DEFAULT 0,
  costo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,  -- costo por 1 unidad
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS producto_receta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad NUMERIC(14,3) NOT NULL,            -- por 1 unidad del producto, en la unidad del insumo
  UNIQUE (producto_id, insumo_id)
);

CREATE TABLE IF NOT EXISTS movimientos_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                          -- entrada | salida | ajuste
  cantidad NUMERIC(14,3) NOT NULL,            -- en la unidad del insumo (positiva)
  referencia_tipo TEXT,                        -- compra | venta | ajuste | inicial
  referencia_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_empresa ON insumos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_receta_producto ON producto_receta(producto_id);
CREATE INDEX IF NOT EXISTS idx_receta_insumo ON producto_receta(insumo_id);
CREATE INDEX IF NOT EXISTS idx_movinsumos_insumo ON movimientos_insumos(insumo_id);

-- RLS: aislamiento por empresa, igual que el resto de tablas
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_receta ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos_by_empresa" ON insumos;
CREATE POLICY "insumos_by_empresa" ON insumos FOR ALL USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "receta_by_empresa" ON producto_receta;
CREATE POLICY "receta_by_empresa" ON producto_receta FOR ALL USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "movinsumos_by_empresa" ON movimientos_insumos;
CREATE POLICY "movinsumos_by_empresa" ON movimientos_insumos FOR ALL USING (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
);

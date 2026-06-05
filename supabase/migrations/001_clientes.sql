-- ============================================
-- MIGRACIÓN: módulo de clientes básico (Fase 3, Bloque 3)
-- Correr en el SQL Editor de Supabase. Es idempotente.
-- ============================================

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  notas TEXT,
  total_compras DECIMAL(12,2) DEFAULT 0,   -- acumulado, se recalcula al vender/anular
  cantidad_compras INTEGER DEFAULT 0,       -- acumulado
  ultima_compra TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vincular ventas con un cliente (opcional: puede quedar null)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id UUID
  REFERENCES clientes(id) ON DELETE SET NULL;

-- RLS: aislamiento por empresa, igual que el resto de tablas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_by_empresa" ON clientes;
CREATE POLICY "clientes_by_empresa" ON clientes
  FOR ALL USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);

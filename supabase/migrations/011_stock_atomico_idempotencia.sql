-- ============================================
-- MIGRACIÓN: stock atómico + idempotencia de ventas
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- 1) Funciones para mover stock en un solo UPDATE atómico (evita que dos ventas
--    simultáneas del mismo producto pierdan un descuento). Solo las llama el
--    servidor con el service_role; se revoca a todos los demás.
-- 2) ventas.idempotency_key + índice único: si el celular reintenta un cobro
--    tras una caída de red, no se duplica la venta.
-- ============================================

-- 1) Stock atómico -------------------------------------------------------------

CREATE OR REPLACE FUNCTION ajustar_stock_producto(p_id UUID, p_empresa_id UUID, p_delta NUMERIC)
RETURNS void AS $$
  UPDATE productos
     SET stock_actual = GREATEST(stock_actual + p_delta, 0),
         updated_at = NOW()
   WHERE id = p_id AND empresa_id = p_empresa_id;
$$ LANGUAGE sql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION ajustar_stock_insumo(p_id UUID, p_empresa_id UUID, p_delta NUMERIC)
RETURNS void AS $$
  UPDATE insumos
     SET stock_actual = GREATEST(stock_actual + p_delta, 0),
         updated_at = NOW()
   WHERE id = p_id AND empresa_id = p_empresa_id;
$$ LANGUAGE sql SECURITY INVOKER;

-- Solo el servidor (service_role) puede llamarlas; nunca el navegador.
REVOKE ALL ON FUNCTION ajustar_stock_producto(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION ajustar_stock_insumo(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ajustar_stock_producto(UUID, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION ajustar_stock_insumo(UUID, UUID, NUMERIC) TO service_role;

-- 2) Idempotencia de ventas ----------------------------------------------------

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_idempotency
  ON ventas(empresa_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

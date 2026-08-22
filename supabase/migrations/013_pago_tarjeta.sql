-- ============================================
-- MIGRACIÓN: cobro con tarjeta + recargo
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- 1) `tarjeta` como método de pago válido en las ventas.
-- 2) `empresas.recargo_tarjeta_pct`: el porcentaje que el negocio le suma a la
--    venta cuando el cliente paga con tarjeta (0 = sin recargo, el default).
-- 3) `ventas.recargo`: los pesos que se cobraron de más en esa venta, guardados
--    aparte para que en reportes se vea cuánto entró por ese concepto y no se
--    confunda con el precio de los productos.
-- ============================================

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'breb', 'transferencia', 'mixto', 'tarjeta'));

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS recargo_tarjeta_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS recargo NUMERIC(12,2) NOT NULL DEFAULT 0;

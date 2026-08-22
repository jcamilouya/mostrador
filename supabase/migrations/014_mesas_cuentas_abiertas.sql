-- ============================================
-- MIGRACIÓN: cuentas abiertas (mesas de restaurante)
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- En un restaurante la cuenta no se arma de una sola vez: el mesero toma un
-- pedido, media hora después le agregan dos cervezas y un postre, y se cobra al
-- final. Una venta puede quedar en estado `abierta` con una etiqueta libre
-- ("Mesa 4", "Para llevar", "Barra 2").
--
-- Reglas: una cuenta `abierta` NO descuenta inventario ni cuenta como ingreso.
-- Solo al cobrarla pasa a `completada` y ahí sí se descuenta todo. Por eso los
-- reportes y la analítica, que filtran por `estado = 'completada'`, no cambian.
-- ============================================

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_estado_check
  CHECK (estado IN ('pendiente', 'completada', 'cancelada', 'abierta'));

-- Etiqueta de la cuenta. Texto libre a propósito: cada negocio nombra sus
-- mesas distinto y no vale la pena obligarlos a un plano de salón.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS mesa TEXT;

CREATE INDEX IF NOT EXISTS idx_ventas_abiertas
  ON ventas(empresa_id, estado)
  WHERE estado = 'abierta';

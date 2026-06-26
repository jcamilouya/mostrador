-- ============================================
-- MIGRACIÓN: pasarela de pagos Wompi (suscripción del plan)
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- Modelo: pago único que renueva el plan 30 días (Wompi no tiene débito
-- automático nativo). El plan se activa SOLO cuando el webhook confirma
-- que Wompi aprobó el pago, nunca desde el navegador.
-- ============================================

-- Pagos del plan (uno por intento de cobro)
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,                         -- 'basico' | 'pro'
  referencia TEXT NOT NULL UNIQUE,            -- referencia única enviada a Wompi
  monto_centavos INTEGER NOT NULL,            -- COP * 100
  estado TEXT NOT NULL DEFAULT 'pending',     -- pending | succeeded | failed
  wompi_transaccion_id TEXT,                  -- id real de la transacción Wompi
  metodo TEXT,                                -- CARD | PSE | NEQUI | BANCOLOMBIA_TRANSFER…
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_empresa ON pagos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagos_referencia ON pagos(referencia);

-- Idempotencia de webhooks: cada evento se procesa una sola vez
CREATE TABLE IF NOT EXISTS wompi_eventos (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: el dueño solo ve los pagos de su empresa (lectura). Las escrituras las
-- hace el servidor con el admin client (bypasea RLS) tras validar identidad/firma.
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pagos_by_empresa" ON pagos;
CREATE POLICY "pagos_by_empresa" ON pagos
  FOR SELECT USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

-- ============================================
-- MIGRACIÓN: QR oficial Bre-B del negocio (QR universal)
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- Guarda el contenido (payload EMVCo) del QR Bre-B OFICIAL que el negocio
-- generó en la app de su propio banco. Mostrador lo decodifica al subirlo y
-- guarda aquí el texto, para re-dibujar un QR nítido y escaneable en el cobro.
-- Funciona para cualquier banco (Nequi, Bancolombia, Daviplata, etc.).
-- ============================================

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS breb_qr_payload TEXT;

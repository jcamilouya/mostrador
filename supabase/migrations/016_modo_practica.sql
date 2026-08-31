-- ============================================
-- MIGRACIÓN: modo práctica y guía del POS
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- 1) `modo_practica`: el negocio está aprendiendo. El POS deja vender, cobrar y
--    ver la pantalla de "¡Vendido!", pero NO guarda nada: ni ventas, ni
--    descuentos de inventario, ni acumulados del cliente. Así el dueño toca todo
--    sin miedo a dañar sus cuentas.
--
--    OJO: el default es FALSE a propósito. Los negocios que YA están vendiendo
--    (un restaurante en producción) no pueden despertar en modo práctica y dejar
--    de registrar su caja. Solo se enciende al crear una empresa nueva.
--
-- 2) `guia_pos_vista`: los tres globos de la pantalla de vender se muestran una
--    sola vez. Se guarda en la empresa y no en el navegador para que no vuelvan
--    a salir al cambiar de celular.
-- ============================================

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modo_practica BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS guia_pos_vista BOOLEAN NOT NULL DEFAULT FALSE;

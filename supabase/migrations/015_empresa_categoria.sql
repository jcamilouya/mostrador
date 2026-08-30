-- ============================================
-- MIGRACIÓN: guardar el tipo de negocio
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- El onboarding pregunta "¿qué tipo de negocio es?" (restaurante, tienda,
-- cafetería…) desde siempre, pero la respuesta NUNCA se guardaba: no existía la
-- columna. Se necesita para arrancar al negocio con categorías y productos de
-- ejemplo según lo que venda, en vez de dejarlo en una pantalla vacía.
-- ============================================

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS categoria TEXT;

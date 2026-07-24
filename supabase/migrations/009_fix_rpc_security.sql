-- ============================================
-- MIGRACIÓN DE SEGURIDAD: blindar las funciones RPC de analítica
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- PROBLEMA: ventas_por_hora / top_productos / balance_diario eran
-- SECURITY DEFINER (corren como owner, BYPASEAN RLS) y recibían p_empresa_id
-- libre, sin REVOKE. Cualquiera con la anon key (pública) podía leer las
-- finanzas de CUALQUIER empresa pasando su UUID.
--
-- FIX: SECURITY INVOKER → corren como el usuario que llama, así la RLS de
-- ventas/egresos/venta_items filtra a SU empresa (pasar otro empresa_id
-- devuelve vacío). Además se revoca a PUBLIC/anon y se concede solo a
-- authenticated.
-- ============================================

ALTER FUNCTION ventas_por_hora(UUID, INTEGER) SECURITY INVOKER;
ALTER FUNCTION top_productos(UUID, INTEGER) SECURITY INVOKER;
ALTER FUNCTION balance_diario(UUID, INTEGER) SECURITY INVOKER;

REVOKE ALL ON FUNCTION ventas_por_hora(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION top_productos(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION balance_diario(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ventas_por_hora(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION top_productos(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION balance_diario(UUID, INTEGER) TO authenticated;

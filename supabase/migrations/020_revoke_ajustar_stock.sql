-- ============================================
-- MIGRACIÓN DE SEGURIDAD (cinturón extra) — correr en el SQL Editor.
-- Idempotente, no toca datos.
--
-- La 011 hizo `REVOKE ALL ... FROM PUBLIC` sobre `ajustar_stock_*`, pero
-- Supabase le da EXECUTE a `anon` y `authenticated` DIRECTAMENTE (no vía
-- PUBLIC), así que ese REVOKE no se lo quitaba. Comprobado el 2026-11-13 con
-- una cuenta de prueba contra la base real: el navegador podía llamar las dos
-- funciones.
--
-- Hoy NO es un agujero: son SECURITY INVOKER, el UPDATE de adentro choca con
-- la RLS de solo lectura (018/019) y el stock no se mueve. Pero si alguien
-- algún día las pasa a SECURITY DEFINER, cualquier navegador podría mover el
-- stock de cualquier negocio. La app solo las llama con el admin client
-- (`lib/insumos/consumo.ts`), que usa service_role y conserva el permiso.
-- ============================================

REVOKE EXECUTE ON FUNCTION ajustar_stock_producto(UUID, UUID, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION ajustar_stock_insumo(UUID, UUID, NUMERIC)   FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION ajustar_stock_producto(UUID, UUID, NUMERIC) TO service_role;
GRANT  EXECUTE ON FUNCTION ajustar_stock_insumo(UUID, UUID, NUMERIC)   TO service_role;

-- Verificación: las dos filas deben decir solo postgres / service_role.
SELECT p.proname, r.rolname
FROM pg_proc p
JOIN LATERAL aclexplode(p.proacl) a ON TRUE
JOIN pg_roles r ON r.oid = a.grantee
WHERE p.proname IN ('ajustar_stock_producto', 'ajustar_stock_insumo')
ORDER BY 1, 2;

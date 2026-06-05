-- =====================================================
-- Mostrador — Habilitar Supabase Realtime (Fase 6)
-- =====================================================
-- El dashboard se actualiza solo (KPIs, gráfico, analítica) cuando entra
-- una venta o un gasto. Para que eso funcione hay que agregar las tablas
-- `ventas` y `egresos` a la publicación de Realtime.
--
-- CÓMO APLICAR:
--   Opción A — SQL Editor: pega y ejecuta este archivo en Supabase.
--   Opción B — Panel: Database → Replication → publicación `supabase_realtime`
--             → activa las tablas `ventas` y `egresos`.
--
-- La seguridad la sigue garantizando RLS: cada cliente solo recibe eventos
-- de las filas de SU empresa (el componente filtra por empresa_id y las
-- políticas RLS ya creadas en schema.sql restringen el acceso).
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE ventas;
ALTER PUBLICATION supabase_realtime ADD TABLE egresos;

-- Si alguna ya estaba en la publicación, el ADD falla con "already member".
-- En ese caso ignóralo: ya está habilitada.

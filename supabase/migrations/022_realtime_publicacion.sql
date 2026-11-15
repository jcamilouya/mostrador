-- ============================================
-- MIGRACIÓN: habilitar Realtime de ventas y gastos — correr en el SQL Editor.
-- Idempotente (solo agrega lo que falta). No toca datos.
--
-- Comprobado el 2026-11-15 mirando el websocket del navegador: Supabase
-- respondía "Unable to subscribe to changes … table: egresos", porque esa
-- tabla no estaba en la publicación `supabase_realtime`. Como la app escuchaba
-- ventas y egresos en el MISMO canal, el canal entero se caía y la
-- actualización en vivo (inicio, mesas, celular del mesero ↔ caja) NUNCA
-- funcionó en producción. El código ya los separó en canales distintos; esto
-- habilita las tablas.
--
-- Seguridad: Realtime respeta RLS (políticas SELECT de la 019/021): cada
-- navegador solo recibe los cambios de SU empresa.
-- ============================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ventas', 'egresos', 'salon_piezas'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'agregada a realtime: %', t;
    END IF;
  END LOOP;
END $$;

-- Verificación: deben salir ventas, egresos y salon_piezas.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename IN ('ventas', 'egresos', 'salon_piezas')
ORDER BY tablename;

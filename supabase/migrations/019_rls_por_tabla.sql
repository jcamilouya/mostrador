-- ============================================
-- MIGRACIÓN DE SEGURIDAD (remate de la 018) — correr en el SQL Editor.
-- Es idempotente y NO toca ningún dato: solo permisos.
--
-- POR QUÉ HACE FALTA
-- ------------------
-- La 018 arreglaba cada tabla nombrando su política:
--   DROP POLICY IF EXISTS "empresas_update_own" ON empresas;
-- Eso funcionó en `usuarios`, `productos` y las demás, pero NO en `empresas`:
-- en la base real esa política tiene otro nombre que en `schema.sql` (se
-- renombró o se recreó desde el panel de Supabase en algún momento). Con
-- `IF EXISTS` el DROP no encuentra nada, **no da error**, y la política
-- permisiva de verdad sobrevive. La migración decía "Success" y el agujero
-- seguía abierto.
--
-- Comprobado después de correr la 018: una cuenta con sesión todavía podía
-- ponerse `plan = 'pro'`, renombrar su empresa y **BORRARLA COMPLETA** con un
-- solo DELETE desde el navegador.
--
-- CÓMO SE ARREGLA
-- ---------------
-- Sin nombres. Se recorre `pg_policies` y se borra TODA política de cada tabla,
-- cualquiera sea su nombre, y después se crea la única que queremos: leer lo
-- suyo. Así no importa cómo se llamen hoy ni cómo se llamaron ayer.
--
-- Sigue siendo seguro por lo mismo que la 018: la app nunca escribe con la
-- llave del navegador — todo write va con `service_role`, que no pasa por RLS.
-- Y el SELECT se conserva con el mismo alcance, que es de lo que viven los
-- Server Components y el Realtime.
--
-- Al final imprime la lista de políticas que quedaron, para poder verificarlo.
-- ============================================

DO $$
DECLARE
  pol   RECORD;
  t     TEXT;
  tablas TEXT[] := ARRAY[
    'empresas', 'usuarios', 'categorias', 'productos', 'ventas', 'venta_items',
    'egresos', 'movimientos_inventario', 'clientes', 'insumos', 'producto_receta',
    'movimientos_insumos', 'pagos', 'pagos_breb'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- Si la tabla no existe en esta base, seguir con la siguiente.
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'tabla % no existe, se salta', t;
      CONTINUE;
    END IF;

    -- Borrar TODAS sus políticas, se llamen como se llamen.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'borrada politica % de %', pol.policyname, t;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── Ahora la ÚNICA política de cada tabla: leer lo de tu empresa ────────────

CREATE POLICY "empresas_select_own" ON empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- `usuarios` se filtra por el propio id: es la tabla que dice a qué empresa
-- perteneces, así que no puede preguntarse a sí misma.
CREATE POLICY "usuarios_select_own" ON usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "categorias_select_own" ON categorias
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "productos_select_own" ON productos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "ventas_select_own" ON ventas
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "venta_items_select_own" ON venta_items
  FOR SELECT TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "egresos_select_own" ON egresos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "movimientos_inventario_select_own" ON movimientos_inventario
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "clientes_select_own" ON clientes
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "insumos_select_own" ON insumos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "producto_receta_select_own" ON producto_receta
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "movimientos_insumos_select_own" ON movimientos_insumos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pagos_select_own" ON pagos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pagos_breb_select_own" ON pagos_breb
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- ── Verificación: debe salir UNA fila por tabla y todas con cmd = SELECT ────
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

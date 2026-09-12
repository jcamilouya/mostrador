-- ============================================
-- MIGRACIÓN DE SEGURIDAD — URGENTE. Correr en el SQL Editor de Supabase.
-- Es idempotente y NO borra ni cambia ningún dato: solo permisos.
--
-- QUÉ ESTABA MAL
-- --------------
-- Las políticas de RLS se escribieron con `FOR ALL`, que no es solo leer: es
-- leer, insertar, actualizar y borrar. Como la llave `anon` viaja en el
-- navegador (tiene que, es pública), cualquier cliente con sesión podía
-- escribir en la base SALTÁNDOSE la app por completo. Comprobado con dos
-- cuentas de prueba contra la base real:
--
--   1) CRÍTICO — robo de negocio. La política de `usuarios` era
--      `FOR ALL USING (id = auth.uid())`: el dueño podía actualizar SU PROPIA
--      fila, y `empresa_id` es una columna de esa fila. Cambiándola al id de
--      otro negocio, pasaba a ver y modificar TODO lo de ese negocio: ventas,
--      clientes, costos, gastos. Un cliente de Mostrador podía quedarse con la
--      contabilidad de otro.
--
--   2) GRAVE — plan Pro gratis. `empresas_update_own` dejaba al dueño
--      actualizar su propia empresa, y ahí viven `plan` y `plan_expira_en`.
--      Un PATCH y quedaba en Pro hasta 2035, sin pasar por Wompi.
--
--   3) Y en general, cualquiera podía reescribir sus ventas y su inventario sin
--      pasar por las validaciones de la app (precios negativos, totales que no
--      cuadran, stock inventado).
--
-- POR QUÉ ES SEGURO ARREGLARLO ASÍ
-- --------------------------------
-- La app **no escribe nunca** con la llave del navegador: las 21 rutas y
-- acciones que escriben usan `createAdminClient()` (service_role), y el
-- service_role NO pasa por RLS. Se verificó archivo por archivo. Así que quitar
-- el permiso de escritura a `authenticated` no le quita nada a la app; solo
-- cierra la puerta de atrás.
--
-- Lo que SÍ se conserva es el SELECT, con el mismo alcance de siempre (cada uno
-- ve lo de su empresa), porque de eso dependen los Server Components y el
-- Realtime del dashboard.
-- ============================================

-- ── 1. usuarios: leer su fila, nada más ─────────────────────────────────────
-- Aquí estaba el robo de negocio.
DROP POLICY IF EXISTS "usuarios_own_empresa" ON usuarios;
DROP POLICY IF EXISTS "usuarios_select_own" ON usuarios;
CREATE POLICY "usuarios_select_own" ON usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ── 2. empresas: leer la propia, nada más ───────────────────────────────────
-- Aquí estaba el plan Pro gratis. El INSERT del onboarding lo hace el
-- service_role, así que tampoco hace falta el permiso de insertar.
DROP POLICY IF EXISTS "empresas_insert_authenticated" ON empresas;
DROP POLICY IF EXISTS "empresas_update_own" ON empresas;
DROP POLICY IF EXISTS "empresas_delete_own" ON empresas;
DROP POLICY IF EXISTS "empresas_select_own" ON empresas;
CREATE POLICY "empresas_select_own" ON empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- ── 3. Datos del negocio: solo lectura, con el mismo alcance ────────────────
DROP POLICY IF EXISTS "categorias_by_empresa" ON categorias;
CREATE POLICY "categorias_by_empresa" ON categorias
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "productos_by_empresa" ON productos;
CREATE POLICY "productos_by_empresa" ON productos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ventas_by_empresa" ON ventas;
CREATE POLICY "ventas_by_empresa" ON ventas
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "venta_items_by_empresa" ON venta_items;
CREATE POLICY "venta_items_by_empresa" ON venta_items
  FOR SELECT TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "egresos_by_empresa" ON egresos;
CREATE POLICY "egresos_by_empresa" ON egresos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "movimientos_inventario_by_empresa" ON movimientos_inventario;
CREATE POLICY "movimientos_inventario_by_empresa" ON movimientos_inventario
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "pagos_breb_by_empresa" ON pagos_breb;
CREATE POLICY "pagos_breb_by_empresa" ON pagos_breb
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "clientes_by_empresa" ON clientes;
CREATE POLICY "clientes_by_empresa" ON clientes
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insumos_by_empresa" ON insumos;
CREATE POLICY "insumos_by_empresa" ON insumos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "receta_by_empresa" ON producto_receta;
CREATE POLICY "receta_by_empresa" ON producto_receta
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "movinsumos_by_empresa" ON movimientos_insumos;
CREATE POLICY "movinsumos_by_empresa" ON movimientos_insumos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- `pagos` (Wompi) ya era FOR SELECT. Se deja explícito por si acaso.
DROP POLICY IF EXISTS "pagos_by_empresa" ON pagos;
CREATE POLICY "pagos_by_empresa" ON pagos
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

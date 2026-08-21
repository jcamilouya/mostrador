  -- ============================================
  -- MIGRACIÓN: zona horaria Colombia en las funciones de analítica
  -- Correr en el SQL Editor de Supabase. Es idempotente.
  --
  -- ventas_por_hora y balance_diario agrupaban por hora/día en UTC → las "horas
  -- pico" salían corridas +5h y las ventas de la noche caían en el día siguiente.
  -- Se corrige con AT TIME ZONE 'America/Bogota'. Mantiene SECURITY INVOKER
  -- (ver migración 009).
  -- ============================================

  CREATE OR REPLACE FUNCTION ventas_por_hora(p_empresa_id UUID, p_dias INTEGER DEFAULT 30)
  RETURNS TABLE(hora INTEGER, dia_semana INTEGER, total_ventas BIGINT, monto_total DECIMAL) AS $$
  BEGIN
    RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM (v.created_at AT TIME ZONE 'America/Bogota'))::INTEGER AS hora,
      EXTRACT(DOW FROM (v.created_at AT TIME ZONE 'America/Bogota'))::INTEGER AS dia_semana,
      COUNT(*)::BIGINT AS total_ventas,
      SUM(v.total) AS monto_total
    FROM ventas v
    WHERE v.empresa_id = p_empresa_id
      AND v.estado = 'completada'
      AND v.created_at >= NOW() - (p_dias || ' days')::INTERVAL
    GROUP BY hora, dia_semana
    ORDER BY dia_semana, hora;
  END;
  $$ LANGUAGE plpgsql SECURITY INVOKER;

  CREATE OR REPLACE FUNCTION balance_diario(p_empresa_id UUID, p_dias INTEGER DEFAULT 30)
  RETURNS TABLE(fecha DATE, ingresos DECIMAL, egresos_total DECIMAL, utilidad DECIMAL) AS $$
  BEGIN
    RETURN QUERY
    WITH ingresos_dia AS (
      SELECT DATE(created_at AT TIME ZONE 'America/Bogota') AS dia, SUM(total) AS total
      FROM ventas
      WHERE empresa_id = p_empresa_id AND estado = 'completada'
        AND created_at >= NOW() - (p_dias || ' days')::INTERVAL
      GROUP BY dia
    ),
    egresos_dia AS (
      SELECT egresos.fecha AS dia, SUM(egresos.monto) AS total
      FROM egresos
      WHERE egresos.empresa_id = p_empresa_id
        AND egresos.fecha >= (CURRENT_DATE - p_dias)
      GROUP BY egresos.fecha
    )
    SELECT
      COALESCE(i.dia, e.dia) AS fecha,
      COALESCE(i.total, 0) AS ingresos,
      COALESCE(e.total, 0) AS egresos_total,
      (COALESCE(i.total, 0) - COALESCE(e.total, 0)) AS utilidad
    FROM ingresos_dia i
    FULL OUTER JOIN egresos_dia e ON i.dia = e.dia
    ORDER BY fecha DESC;
  END;
  $$ LANGUAGE plpgsql SECURITY INVOKER;

  -- Reafirmar permisos (CREATE OR REPLACE los conserva, pero por si acaso).
  REVOKE ALL ON FUNCTION ventas_por_hora(UUID, INTEGER) FROM PUBLIC;
  REVOKE ALL ON FUNCTION balance_diario(UUID, INTEGER) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION ventas_por_hora(UUID, INTEGER) TO authenticated;
  GRANT EXECUTE ON FUNCTION balance_diario(UUID, INTEGER) TO authenticated;

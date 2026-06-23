-- ============================================
-- MIGRACIÓN: panel super admin (back-office del SaaS)
-- Correr en el SQL Editor de Supabase. Es idempotente.
-- ============================================

-- Notas internas de soporte por empresa (solo visibles para el super admin)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS notas_internas TEXT;

-- ============================================
-- TABLA: admin_log (auditoría de acciones del super admin)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  accion TEXT NOT NULL,                 -- 'cambiar_plan' | 'extender' | 'activar_pro' | 'notas' ...
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  empresa_nombre TEXT,                  -- snapshot por si se borra la empresa
  detalle JSONB,                        -- { antes, despues }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_log_empresa ON admin_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_admin_log_fecha ON admin_log(created_at DESC);

-- RLS: la tabla solo se toca con service_role (que bypasea RLS).
-- Sin políticas → ningún cliente anon/authenticated puede leerla ni escribirla.
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RPC: resumen agregado de empresas (lista + overview + detalle)
-- p_empresa_id NULL  → todas las empresas (lista/overview)
-- p_empresa_id <id>  → una sola empresa (detalle)
-- ============================================
CREATE OR REPLACE FUNCTION admin_empresas_resumen(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  nombre TEXT,
  nit TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  plan TEXT,
  plan_expira_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  whatsapp_numero TEXT,
  breb_merchant_id TEXT,
  breb_banco TEXT,
  notas_internas TEXT,
  usuario_id UUID,
  usuario_nombre TEXT,
  usuario_email TEXT,
  ventas_count BIGINT,
  ventas_monto NUMERIC,
  primera_venta TIMESTAMPTZ,
  ultima_venta TIMESTAMPTZ,
  productos_count BIGINT,
  egresos_count BIGINT,
  egresos_monto NUMERIC,
  clientes_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id, e.nombre, e.nit, e.email, e.telefono, e.direccion,
    e.plan, e.plan_expira_en, e.created_at,
    e.whatsapp_numero, e.breb_merchant_id, e.breb_banco, e.notas_internas,
    u.id   AS usuario_id,
    u.nombre AS usuario_nombre,
    u.email AS usuario_email,
    COALESCE(v.cnt, 0)   AS ventas_count,
    COALESCE(v.monto, 0) AS ventas_monto,
    v.primera            AS primera_venta,
    v.ultima             AS ultima_venta,
    COALESCE(p.cnt, 0)   AS productos_count,
    COALESCE(g.cnt, 0)   AS egresos_count,
    COALESCE(g.monto, 0) AS egresos_monto,
    COALESCE(c.cnt, 0)   AS clientes_count
  FROM empresas e
  LEFT JOIN LATERAL (
    SELECT id, nombre, email
    FROM usuarios
    WHERE empresa_id = e.id
    ORDER BY created_at
    LIMIT 1
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, SUM(total) AS monto,
           MIN(created_at) AS primera, MAX(created_at) AS ultima
    FROM ventas
    WHERE empresa_id = e.id AND estado = 'completada'
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM productos WHERE empresa_id = e.id AND activo = true
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, SUM(monto) AS monto FROM egresos WHERE empresa_id = e.id
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM clientes WHERE empresa_id = e.id
  ) c ON true
  WHERE p_empresa_id IS NULL OR e.id = p_empresa_id
  ORDER BY e.created_at DESC;
$$;

-- Solo el service_role puede ejecutar el RPC (defensa en profundidad:
-- aunque alguien tenga la anon key, no puede listar todas las empresas).
REVOKE ALL ON FUNCTION admin_empresas_resumen(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_empresas_resumen(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_empresas_resumen(UUID) TO service_role;

-- =====================================================
-- Mostrador — Schema PostgreSQL para Supabase
-- Copiado literal de ROADMAP.md sección 3.3
-- Ejecutar en el SQL Editor de Supabase al crear el proyecto.
-- =====================================================

-- ============================================
-- TABLA: empresas (tenant principal)
-- ============================================
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  nit TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  moneda TEXT DEFAULT 'COP',
  tasa_iva DECIMAL(5,2) DEFAULT 19.00,
  plan TEXT DEFAULT 'basico' CHECK (plan IN ('basico', 'pro', 'trial')),
  plan_expira_en TIMESTAMPTZ,
  breb_merchant_id TEXT,
  breb_llave TEXT,
  breb_banco TEXT,
  whatsapp_numero TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: usuarios (dueños, 1 por empresa)
-- ============================================
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: categorias (de productos)
-- ============================================
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: productos
-- ============================================
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  sku TEXT,
  codigo_barras TEXT,
  precio_compra DECIMAL(12,2) DEFAULT 0,
  precio_venta DECIMAL(12,2) NOT NULL,
  stock_actual INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5,
  imagen_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: ventas
-- ============================================
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  numero_venta SERIAL,
  subtotal DECIMAL(12,2) NOT NULL,
  iva DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'breb', 'transferencia', 'mixto')),
  estado TEXT DEFAULT 'completada' CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
  breb_transaccion_id TEXT,
  breb_estado TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: venta_items
-- ============================================
CREATE TABLE venta_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  precio_compra DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL
);

-- ============================================
-- TABLA: egresos
-- ============================================
CREATE TABLE egresos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL CHECK (categoria IN (
    'proveedores', 'arriendo', 'servicios', 'nomina',
    'impuestos', 'transporte', 'mantenimiento', 'otros'
  )),
  proveedor TEXT,
  descripcion TEXT,
  monto DECIMAL(12,2) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago TEXT DEFAULT 'efectivo',
  comprobante_url TEXT,
  fuente TEXT DEFAULT 'manual' CHECK (fuente IN ('manual', 'whatsapp_ia', 'recurrente')),
  recurrente BOOLEAN DEFAULT FALSE,
  dia_recurrente INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: movimientos_inventario
-- ============================================
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  referencia_tipo TEXT,
  referencia_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: pagos_breb
-- ============================================
CREATE TABLE pagos_breb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  transaccion_id TEXT UNIQUE NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'fallido', 'expirado')),
  banco_origen TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmado_at TIMESTAMPTZ
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_productos_empresa ON productos(empresa_id);
CREATE INDEX idx_ventas_empresa ON ventas(empresa_id);
CREATE INDEX idx_ventas_fecha ON ventas(created_at);
CREATE INDEX idx_ventas_metodo ON ventas(metodo_pago);
CREATE INDEX idx_egresos_empresa ON egresos(empresa_id);
CREATE INDEX idx_egresos_fecha ON egresos(fecha);
CREATE INDEX idx_egresos_categoria ON egresos(categoria);
CREATE INDEX idx_venta_items_venta ON venta_items(venta_id);
CREATE INDEX idx_movimientos_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_pagos_breb_transaccion ON pagos_breb(transaccion_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_breb ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_own_empresa" ON usuarios
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Cualquier authenticated puede CREAR una empresa (durante onboarding).
-- Luego SELECT/UPDATE/DELETE solo si pertenece a su empresa.
CREATE POLICY "empresas_insert_authenticated" ON empresas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "empresas_select_own" ON empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresas_update_own" ON empresas
  FOR UPDATE TO authenticated
  USING (id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresas_delete_own" ON empresas
  FOR DELETE TO authenticated
  USING (id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "categorias_by_empresa" ON categorias
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "productos_by_empresa" ON productos
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "ventas_by_empresa" ON ventas
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "venta_items_by_empresa" ON venta_items
  FOR ALL USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "egresos_by_empresa" ON egresos
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "movimientos_inventario_by_empresa" ON movimientos_inventario
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pagos_breb_by_empresa" ON pagos_breb
  FOR ALL USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- ============================================
-- FUNCIONES de analítica
-- ============================================

-- Ventas por hora (heatmap)
CREATE OR REPLACE FUNCTION ventas_por_hora(p_empresa_id UUID, p_dias INTEGER DEFAULT 30)
RETURNS TABLE(hora INTEGER, dia_semana INTEGER, total_ventas BIGINT, monto_total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM v.created_at)::INTEGER AS hora,
    EXTRACT(DOW FROM v.created_at)::INTEGER AS dia_semana,
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

-- Top productos
CREATE OR REPLACE FUNCTION top_productos(p_empresa_id UUID, p_limite INTEGER DEFAULT 10)
RETURNS TABLE(producto_id UUID, nombre TEXT, total_vendido BIGINT, monto_total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vi.producto_id,
    vi.nombre_producto AS nombre,
    SUM(vi.cantidad)::BIGINT AS total_vendido,
    SUM(vi.subtotal) AS monto_total
  FROM venta_items vi
  JOIN ventas v ON v.id = vi.venta_id
  WHERE v.empresa_id = p_empresa_id
    AND v.estado = 'completada'
  GROUP BY vi.producto_id, vi.nombre_producto
  ORDER BY total_vendido DESC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Balance diario
CREATE OR REPLACE FUNCTION balance_diario(p_empresa_id UUID, p_dias INTEGER DEFAULT 30)
RETURNS TABLE(fecha DATE, ingresos DECIMAL, egresos_total DECIMAL, utilidad DECIMAL) AS $$
BEGIN
  RETURN QUERY
  WITH ingresos_dia AS (
    SELECT DATE(created_at) AS dia, SUM(total) AS total
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

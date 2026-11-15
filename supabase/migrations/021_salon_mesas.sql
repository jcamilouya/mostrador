-- ============================================
-- MIGRACIÓN: plano del salón (mesas dibujadas) — correr en el SQL Editor.
-- Idempotente. No toca datos existentes.
--
-- Cada restaurante dibuja su salón: zonas (Salón, Terraza, Segundo piso…) con
-- un tamaño en cuadros, y dentro piezas: mesas (con forma y puestos) y
-- espacios fijos (cocina, barra, baños, entrada, caja, paredes).
--
-- Una cuenta abierta (`ventas.estado = 'abierta'`, migración 014) ahora puede
-- apuntar a una mesa del plano con `ventas.mesa_id`. La etiqueta libre
-- `ventas.mesa` se sigue llenando con el nombre de la mesa, así el historial y
-- los reportes no cambian, y las cuentas viejas ("Para llevar", "Barra 2")
-- siguen funcionando sin mesa_id.
--
-- Seguridad (regla de la 018/019): `authenticated` SOLO puede LEER. Todo write
-- va por Server Actions con service_role.
-- ============================================

CREATE TABLE IF NOT EXISTS salon_zonas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 40),
  cols        INT  NOT NULL DEFAULT 14 CHECK (cols BETWEEN 6 AND 40),
  filas       INT  NOT NULL DEFAULT 9  CHECK (filas BETWEEN 4 AND 30),
  orden       INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_zonas_empresa ON salon_zonas(empresa_id);

CREATE TABLE IF NOT EXISTS salon_piezas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  zona_id     UUID NOT NULL REFERENCES salon_zonas(id) ON DELETE CASCADE,
  -- 'mesa' es lo que se atiende; lo demás es dibujo para ubicarse.
  tipo        TEXT NOT NULL CHECK (tipo IN ('mesa','cocina','barra','banos','entrada','caja','pared')),
  forma       TEXT CHECK (forma IN ('cuadrada','redonda','larga','butaca')),
  nombre      TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 40),
  puestos     INT  CHECK (puestos BETWEEN 1 AND 40),
  x           INT  NOT NULL CHECK (x >= 0),
  y           INT  NOT NULL CHECK (y >= 0),
  w           INT  NOT NULL CHECK (w BETWEEN 1 AND 20),
  h           INT  NOT NULL CHECK (h BETWEEN 1 AND 20),
  -- Reserva de la mesa (una a la vez). Pasada la hora + 1 h deja de mostrarse.
  reserva_nombre   TEXT CHECK (reserva_nombre IS NULL OR char_length(reserva_nombre) <= 60),
  reserva_en       TIMESTAMPTZ,
  reserva_personas INT CHECK (reserva_personas IS NULL OR reserva_personas BETWEEN 1 AND 99),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_piezas_empresa ON salon_piezas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_salon_piezas_zona    ON salon_piezas(zona_id);

-- La cuenta abierta sabe en qué mesa está. Si se borra la mesa del plano, las
-- ventas viejas conservan su etiqueta de texto (`ventas.mesa`).
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS mesa_id UUID REFERENCES salon_piezas(id) ON DELETE SET NULL;
-- El mesero pidió la cuenta: la mesa pasa a "por cobrar" (amarillo).
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cuenta_pedida_en TIMESTAMPTZ;

-- UNA cuenta abierta por mesa. Si dos meseros abren la misma mesa al mismo
-- tiempo, la base rechaza la segunda (23505) en vez de crear dos cuentas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_mesa_abierta
  ON ventas(mesa_id)
  WHERE estado = 'abierta' AND mesa_id IS NOT NULL;

-- ── RLS: solo lectura de lo propio (nunca FOR ALL) ──────────────────────────
ALTER TABLE salon_zonas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_piezas ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('salon_zonas', 'salon_piezas')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "salon_zonas_select_own" ON salon_zonas
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "salon_piezas_select_own" ON salon_piezas
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- ── Realtime: el celular del mesero y la caja ven los cambios del plano ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salon_piezas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salon_piezas;
  END IF;
END $$;

-- ── Verificación: dos filas, ambas cmd = SELECT ─────────────────────────────
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('salon_zonas', 'salon_piezas')
ORDER BY tablename;

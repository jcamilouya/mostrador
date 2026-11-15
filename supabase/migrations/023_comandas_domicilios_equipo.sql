-- ============================================
-- MIGRACIÓN: comandas a cocina, para llevar / domicilios y equipo (meseros y
-- caja) — fases 2, 3 y 4 de Mesas. Correr en el SQL Editor. Idempotente.
-- No toca datos existentes: todo lo nuevo tiene default.
--
-- Seguridad (regla de la 018/019): `authenticated` SOLO puede LEER. Todo write
-- va por Server Actions con service_role.
-- ============================================

-- ── Fase 2: marchar a cocina ────────────────────────────────────────────────
-- Cada línea sabe si ya se mandó a cocina, y puede llevar una nota
-- ("sin cebolla"). Una línea marchada a medias se guarda en dos filas.
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS marchado_en TIMESTAMPTZ;
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE venta_items DROP CONSTRAINT IF EXISTS venta_items_nota_largo;
ALTER TABLE venta_items ADD CONSTRAINT venta_items_nota_largo
  CHECK (nota IS NULL OR char_length(nota) <= 140);

-- La comanda: lo que se mandó a cocina en un "Marchar", numerada por negocio.
-- Es un registro aparte (no se reescribe con la cuenta) para poder
-- reimprimirla y para que cocina vea el historial del turno.
CREATE TABLE IF NOT EXISTS comandas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  venta_id    UUID REFERENCES ventas(id) ON DELETE SET NULL,
  numero      INT  NOT NULL,
  -- 'pedido' = platos nuevos; 'anulado' = quitaron algo que ya estaba en cocina.
  tipo        TEXT NOT NULL DEFAULT 'pedido' CHECK (tipo IN ('pedido', 'anulado')),
  titulo      TEXT NOT NULL,                 -- "Mesa 4", "Para llevar · Ana"…
  detalle     TEXT,                          -- dirección del domicilio, etc.
  items       JSONB NOT NULL DEFAULT '[]',   -- [{ cantidad, nombre, nota }]
  creado_por  TEXT,
  impresa_en  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_comandas_numero ON comandas(empresa_id, numero);
CREATE INDEX IF NOT EXISTS idx_comandas_recientes ON comandas(empresa_id, created_at DESC);

-- ── Fase 3: para llevar y domicilios ────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_pedido TEXT;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_tipo_pedido_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_tipo_pedido_check
  CHECK (tipo_pedido IS NULL OR tipo_pedido IN ('mesa', 'llevar', 'domicilio'));
-- { nombre, telefono, direccion, canal: llamada|whatsapp, pago, nota }
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS domicilio JSONB;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS entrega_estado TEXT;
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_entrega_estado_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_entrega_estado_check
  CHECK (entrega_estado IS NULL OR entrega_estado IN ('cocina', 'camino'));

-- ── Fase 4: equipo ──────────────────────────────────────────────────────────
-- Varias personas por negocio. El dueño es quien lo registró (default).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'dueno';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('dueno', 'caja', 'mesero'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario TEXT;      -- nombre para entrar
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_usuario ON usuarios(lower(usuario)) WHERE usuario IS NOT NULL;

-- ¿El mesero puede cobrar? Por defecto solo cobra la caja.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS mesero_cobra BOOLEAN NOT NULL DEFAULT FALSE;

-- ── RLS: comandas solo lectura de lo propio ─────────────────────────────────
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comandas' LOOP
    EXECUTE format('DROP POLICY %I ON public.comandas', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "comandas_select_own" ON comandas
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- ── Realtime: la impresora de cocina escucha las comandas nuevas ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comandas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comandas;
  END IF;
END $$;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Debe salir: comandas_select_own | SELECT, y 'comandas' en realtime.
SELECT 'politica' AS que, policyname AS valor FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'comandas'
UNION ALL
SELECT 'realtime', tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND tablename = 'comandas';

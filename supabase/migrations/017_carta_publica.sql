-- ============================================
-- MIGRACIÓN: carta digital pública (QR para las mesas)
-- Correr en el SQL Editor de Supabase. Es idempotente.
--
-- 1) `carta_slug`: el nombre bonito del negocio en la URL pública
--    (…/carta/sabore-fast-food). Se genera del nombre y el dueño lo puede
--    cambiar. Único entre todos los negocios, pero puede ser NULL: el índice
--    es parcial para que muchos negocios sin carta no choquen entre sí.
--
-- 2) `carta_activa`: el interruptor. Arranca en FALSE A PROPÓSITO — la carta
--    de un negocio es pública (cualquiera con el link ve sus platos y precios),
--    así que NADIE queda publicado sin haberlo encendido él mismo.
--
-- 3) `productos.en_carta`: para dejar fuera de la carta cosas que se venden
--    pero no se muestran (domicilio, bolsa, desechables). Arranca en TRUE
--    porque lo normal es que un producto sí sea parte de la carta.
-- ============================================

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS carta_slug TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS carta_activa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS empresas_carta_slug_key
  ON empresas (carta_slug)
  WHERE carta_slug IS NOT NULL;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS en_carta BOOLEAN NOT NULL DEFAULT TRUE;

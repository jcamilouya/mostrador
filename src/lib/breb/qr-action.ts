'use server';

import { createClient } from '@/lib/supabase/server';
import { getBrebConfig } from './queries';
import { construirPayloadBreb } from './emv';
import { obtenerQROficial } from './bancolombia';

export type QRPagoResult =
  // QR EMVCo generado localmente con la llave (fallback / escaneable).
  | { modo: 'emv'; payload: string }
  // Imagen del QR oficial devuelta por Bancolombia (solo producción).
  | { modo: 'bancolombia'; imagenBase64: string; formato: 'SVG' | 'PNG' | 'PDF' };

/**
 * Genera el QR para un cobro Bre-B.
 *
 * Nota: el flujo principal del POS ya usa el QR OFICIAL que el negocio sube en
 * Configuración (empresas.breb_qr_payload). Esta acción queda como apoyo para
 * cuando Bancolombia habilite producción (comercios Bancolombia): intenta la API
 * de Bancolombia y, si no, cae al payload EMVCo local con la llave.
 */
export async function generarQRPago(
  monto: number,
  referencia?: string,
): Promise<QRPagoResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) return null;

  const breb = await getBrebConfig(usuario.empresa_id);
  if (!breb.configurado) return null;

  const ref = referencia ?? `mostrador-${Date.now()}`;

  // API de Bancolombia: solo si hay credenciales Y NO es sandbox (sandbox da QR
  // de prueba no pagable + el WAF bloquea). Inactivo hasta tener producción.
  const bancolombiaProd =
    Boolean(process.env.BANCOLOMBIA_CLIENT_ID) &&
    Boolean(process.env.BANCOLOMBIA_CLIENT_SECRET) &&
    !(process.env.BANCOLOMBIA_QR_BASE_URL ?? '').includes('sandbox');

  if (bancolombiaProd && (breb.merchantId || breb.llave)) {
    try {
      const r = await obtenerQROficial({
        tipoLlave: breb.merchantId ? 'MERCHANTID' : 'ALPHANUMERIC',
        valorLlave: breb.merchantId ?? breb.llave!,
      });
      return { modo: 'bancolombia', imagenBase64: r.qrImageBase64, formato: r.formato };
    } catch (e) {
      // Loguear en servidor y caer al fallback EMV local.
      console.error('[Bre-B Bancolombia]', e instanceof Error ? e.message : e);
    }
  }

  // Fallback: payload EMVCo local con la llave registrada.
  if (!breb.llave) return null;
  const payload = construirPayloadBreb({
    llave: breb.llave,
    nombre: breb.nombreNegocio,
    monto,
    referencia: ref,
  });
  return { modo: 'emv', payload };
}

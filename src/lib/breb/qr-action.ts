'use server';

import { createClient } from '@/lib/supabase/server';
import { getBrebConfig } from './queries';
import { construirPayloadBreb } from './emv';
import { crearCobroQR } from './bancolombia';

export type QRPagoResult = {
  payload: string;
  qrId?: string;
  modo: 'bancolombia' | 'emv';
};

/**
 * Genera el payload QR para un cobro Bre-B.
 * Intenta la API de Bancolombia primero; si no está configurada o falla,
 * genera el payload EMVCo localmente con la llave registrada.
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
  if (!breb.configurado || !breb.llave) return null;

  const ref = referencia ?? `mostrador-${Date.now()}`;

  // Intentar la API de Bancolombia solo si hay credenciales Y NO es sandbox.
  // En sandbox la API devuelve QR de prueba que ningún banco puede pagar de
  // verdad; mientras no haya acceso de producción, usamos el QR EMV local.
  const bancolombiaProd =
    Boolean(process.env.BANCOLOMBIA_CLIENT_ID) &&
    Boolean(process.env.BANCOLOMBIA_CLIENT_SECRET) &&
    !(process.env.BANCOLOMBIA_BASE_URL ?? '').includes('sandbox');

  if (bancolombiaProd) {
    try {
      const result = await crearCobroQR({
        monto,
        referencia: ref,
        nombreComercio: breb.nombreNegocio,
        descripcion: `Cobro Mostrador`,
      });
      if (result.qrCode) {
        return { payload: result.qrCode, qrId: result.qrId, modo: 'bancolombia' };
      }
    } catch (e) {
      // Loguear en servidor y caer al fallback EMV
      console.error('[Bre-B Bancolombia]', e instanceof Error ? e.message : e);
    }
  }

  // Fallback: payload EMVCo generado localmente
  const payload = construirPayloadBreb({
    llave: breb.llave,
    nombre: breb.nombreNegocio,
    monto,
    referencia: ref,
  });
  return { payload, modo: 'emv' };
}

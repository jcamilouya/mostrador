/**
 * Helpers de Wompi (pasarela de pagos colombiana).
 *
 * Solo server-side. La llave privada y los secretos NUNCA llegan al navegador.
 * Sandbox vs producción se decide por el prefijo de la llave pública.
 *
 * Patrones basados en la plantilla de PagoKit (seguridad: firma de integridad
 * en el checkout, verificación de checksum del webhook con timingSafeEqual).
 */
import crypto from 'node:crypto';

export const WOMPI_API_BASE =
  (process.env.WOMPI_PUBLIC_KEY ?? '').startsWith('pub_prod_')
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1';

export const ESTA_EN_PRODUCCION = WOMPI_API_BASE.includes('production');

/**
 * Firma de integridad que exige el Widget de Wompi:
 *   SHA256( referencia + montoEnCentavos + moneda + INTEGRITY_SECRET )
 */
export function firmaIntegridad(
  referencia: string,
  montoCentavos: number,
  moneda = 'COP',
): string {
  const secret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) throw new Error('WOMPI_INTEGRITY_SECRET no está configurado');
  return crypto
    .createHash('sha256')
    .update(`${referencia}${montoCentavos}${moneda}${secret}`)
    .digest('hex');
}

type WompiEvent = {
  event?: string;
  timestamp?: number;
  signature?: { checksum?: string; properties?: string[] };
  data?: { transaction?: Record<string, unknown> };
};

/**
 * Verifica el checksum del webhook de Wompi. El checksum es:
 *   SHA256( concat(valores de signature.properties) + timestamp + EVENTS_SECRET )
 * Comparación en tiempo constante para evitar ataques de timing.
 */
export function verificarChecksum(event: WompiEvent): boolean {
  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) return false;
  const checksum = event?.signature?.checksum;
  const properties = event?.signature?.properties;
  if (!checksum || !properties || event.timestamp === undefined) return false;

  const concatenado = properties
    .map((ruta) =>
      ruta
        .split('.')
        .reduce<unknown>(
          (acc, key) =>
            acc == null ? undefined : (acc as Record<string, unknown>)[key],
          event.data,
        ),
    )
    .map((v) => (v == null ? '' : String(v)))
    .join('');

  const calculado = crypto
    .createHash('sha256')
    .update(`${concatenado}${event.timestamp}${secret}`)
    .digest('hex');

  if (calculado.length !== checksum.length) return false;
  return crypto.timingSafeEqual(Buffer.from(calculado), Buffer.from(checksum));
}

/** Mapea el estado de Wompi al estado interno del pago. */
export function mapearEstadoWompi(estado: string): 'succeeded' | 'pending' | 'failed' {
  switch (estado) {
    case 'APPROVED':
      return 'succeeded';
    case 'PENDING':
      return 'pending';
    default: // DECLINED | VOIDED | ERROR
      return 'failed';
  }
}

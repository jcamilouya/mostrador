/**
 * Cliente para la API de Cobros QR de Bancolombia.
 *
 * Autenticación: OAuth2 client_credentials (token expira en ~1200s / 20 min).
 * Endpoint QR: configurado en BANCOLOMBIA_QR_PATH — verificar con la documentación
 * oficial del portal de Bancolombia cuando aprueben el acceso a la API.
 *
 * Solo server-side. Nunca importar desde Client Components.
 */

const BASE_URL = () => process.env.BANCOLOMBIA_BASE_URL ?? 'https://sandbox.apis.bancolombia.com';

async function getAccessToken(): Promise<string> {
  const id = process.env.BANCOLOMBIA_CLIENT_ID;
  const secret = process.env.BANCOLOMBIA_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Bancolombia: credenciales no configuradas');

  const creds = Buffer.from(`${id}:${secret}`).toString('base64');

  const res = await fetch(`${BASE_URL()}/security/oauth-provider/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/vnd.bancolombia.v4+json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    // Desactivar caché: cada deploy serverless necesita su propio token
    cache: 'no-store',
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Bancolombia OAuth ${res.status}: ${texto}`);
  }

  const data = await res.json() as { access_token: string; token_type: string };
  return `${data.token_type} ${data.access_token}`;
}

export type CobroQRInput = {
  monto: number;
  referencia: string;
  nombreComercio?: string;
  descripcion?: string;
};

export type CobroQRResult = {
  qrId: string;
  qrCode: string; // payload EMVCo — se pasa directamente a la librería qrcode para generar imagen
};

export async function crearCobroQR(input: CobroQRInput): Promise<CobroQRResult> {
  const authorization = await getAccessToken();

  // Path configurable — ajustar en .env.local una vez Bancolombia entregue documentación
  const path = process.env.BANCOLOMBIA_QR_PATH ?? '/qr-management/v1/qr-codes';

  const res = await fetch(`${BASE_URL()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.bancolombia.v4+json',
    },
    body: JSON.stringify({
      monto: input.monto,
      referencia: input.referencia,
      ...(input.nombreComercio ? { nombreComercio: input.nombreComercio } : {}),
      ...(input.descripcion ? { descripcion: input.descripcion } : {}),
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Bancolombia QR ${res.status}: ${texto}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Bancolombia puede retornar el código bajo distintos nombres de campo
  const qrCode =
    (data.qrCode ?? data.codigoQR ?? data.qr ?? data.payload ?? '') as string;
  const qrId =
    (data.qrId ?? data.id ?? data.codigoUnico ?? data.transaccionId ?? '') as string;

  return { qrCode, qrId };
}

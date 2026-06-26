/**
 * Cliente server-side de la API "QR Code Information" de Bancolombia.
 *
 * ⚠️ ESTADO: LISTO PARA PRODUCCIÓN, INACTIVO POR AHORA.
 *  - En sandbox la API devuelve un QR de DEMOSTRACIÓN (no pagable) y, además, el
 *    gateway de Bancolombia (WAF Incapsula) bloquea llamadas que no vengan de un
 *    servidor autorizado. Se activa cuando Bancolombia habilite PRODUCCIÓN y
 *    autorice este servidor.
 *  - Solo aplica a comercios con cuenta Bancolombia (la API entrega el QR de una
 *    llave registrada en Bancolombia). Para los demás bancos, el negocio sube su
 *    QR oficial en Configuración (ver ConfigForm + columna empresas.breb_qr_payload).
 *
 * Contrato real (verificado con el swagger oficial qr-code-information-qr-codes v1.0.0):
 *   POST {BASE}/qr-code-image
 *   Headers: client-id, client-secret, message-id (UUID), Content-Type, Accept
 *   Body:   { data: { holder?, qrInformation: { key: { type, value } }, fileFormat } }
 *   Resp:   { data: { qrImage: "<base64 SVG|PNG|PDF>" } }
 *
 * Solo server-side. Nunca importar desde Client Components.
 */
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SANDBOX_BASE =
  'https://gw-sandbox-qa.apps.ambientesbc.com/public-partner/sb/v1/sales-service/customer-management/customer-product-and-service-directory/qr-code-information/qr-codes';

function baseUrl(): string {
  return process.env.BANCOLOMBIA_QR_BASE_URL ?? SANDBOX_BASE;
}

/**
 * Certificado de cliente (mTLS). La API lo exige en producción
 * (application-authentication: certificate). En mostrador/.secrets están el
 * cert y la llave generados para registrar la app en el portal de Bancolombia.
 */
function clientTls(): { cert: Buffer; key: Buffer } | null {
  const certPath = process.env.BANCOLOMBIA_CERT_PATH;
  const keyPath = process.env.BANCOLOMBIA_KEY_PATH;
  if (!certPath || !keyPath) return null;
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

export type ObtenerQROficialInput = {
  /** Tipo de llave registrada (ej. MERCHANTID, NIT, EMAIL, PHONE, ALPHANUMERIC). */
  tipoLlave: string;
  /** Valor de la llave (código de comercio, celular, NIT, correo…). */
  valorLlave: string;
  /** Formato de imagen del QR devuelto. */
  formato?: 'SVG' | 'PNG' | 'PDF';
};

export type QROficialResult = {
  /** Imagen del QR oficial en base64 (en el formato pedido). */
  qrImageBase64: string;
  formato: 'SVG' | 'PNG' | 'PDF';
};

/**
 * Pide a Bancolombia el QR oficial asociado a una llave registrada.
 * Lanza Error si faltan credenciales o si la API responde con error.
 */
export async function obtenerQROficial(
  input: ObtenerQROficialInput,
): Promise<QROficialResult> {
  const clientId = process.env.BANCOLOMBIA_CLIENT_ID;
  const clientSecret = process.env.BANCOLOMBIA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Bancolombia: credenciales (BANCOLOMBIA_CLIENT_ID/SECRET) no configuradas');
  }

  const formato = input.formato ?? 'SVG';
  const body = JSON.stringify({
    data: {
      qrInformation: { key: { type: input.tipoLlave, value: input.valorLlave } },
      fileFormat: formato,
    },
  });

  const url = new URL(`${baseUrl()}/qr-code-image`);
  const tls = clientTls();

  const raw = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'client-id': clientId,
          'client-secret': clientSecret,
          'message-id': randomUUID(),
          'Content-Length': Buffer.byteLength(body),
        },
        ...(tls ?? {}),
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const code = res.statusCode ?? 0;
          if (code >= 200 && code < 300) resolve(data);
          else reject(new Error(`Bancolombia QR ${code}: ${data.slice(0, 300)}`));
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const json = JSON.parse(raw) as { data?: { qrImage?: string } };
  const qrImageBase64 = json.data?.qrImage;
  if (!qrImageBase64) throw new Error('Bancolombia QR: la respuesta no trae imagen');
  return { qrImageBase64, formato };
}

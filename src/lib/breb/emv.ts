/**
 * Constructor de payload EMVCo (Merchant Presented Mode), el estándar de QR
 * de pago que usa Bre-B en Colombia. Genera la cadena que se codifica en el QR.
 *
 * El formato (tag 30 con GUI "co.com.bre-b" + la llave) está calcado de un QR
 * Bre-B real de Bancolombia, por lo que cualquier banco que soporte Bre-B
 * debería poder leerlo. Cada comercio usa SU propia llave Bre-B (la que
 * registró con su banco: celular, correo, NIT o código @).
 */

// Codifica un campo TLV: id (2) + longitud (2, con cero a la izquierda) + valor.
function tlv(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, '0');
  return `${id}${len}${valor}`;
}

// CRC16-CCITT (polinomio 0x1021, init 0xFFFF) — requerido por EMVCo (tag 63).
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Limpia y recorta texto a ASCII imprimible dentro del límite del tag.
function limpiar(texto: string, max: number): string {
  return texto
    .normalize('NFD')
    .replace(/[^\x20-\x7E]/g, '') // sin acentos ni caracteres no imprimibles
    .trim()
    .slice(0, max);
}

export type BrebQRInput = {
  llave: string;
  nombre: string;
  ciudad?: string;
  /** Monto en COP. Si se omite, el QR es estático y el cliente digita el valor. */
  monto?: number;
  /** Referencia/numero de venta para conciliar. */
  referencia?: string;
  /** GUI del dominio Bre-B (lo da tu banco/ACH). Placeholder por defecto. */
  gui?: string;
};

const GUI_BREB_DEFECTO = 'co.com.bre-b';
const CODIGO_BREB = '00000000000000'; // subcampo 01 (reservado) observado en QR Bre-B reales
const MCC_GENERAL = '0000';
const MONEDA_COP = '170'; // ISO 4217
const PAIS_CO = 'CO';

export function construirPayloadBreb(input: BrebQRInput): string {
  const { llave, nombre, ciudad, monto, referencia } = input;
  const gui = input.gui?.trim() || GUI_BREB_DEFECTO;

  // Merchant Account Information de Bre-B (tag 30), calcado de un QR real:
  //   00 = GUI del dominio Bre-B (co.com.bre-b, en minúsculas)
  //   01 = código reservado (14 dígitos)
  //   02 = la llave Bre-B del comercio
  const merchantAccount =
    tlv('00', limpiar(gui, 32)) +
    tlv('01', CODIGO_BREB) +
    tlv('02', limpiar(llave, 99));

  const estatico = monto === undefined || monto <= 0;

  let payload =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', estatico ? '11' : '12') + // 11 estático, 12 dinámico (un solo uso)
    tlv('30', merchantAccount) +
    tlv('52', MCC_GENERAL) +
    tlv('53', MONEDA_COP);

  if (!estatico) {
    payload += tlv('54', String(Math.round(monto!))); // monto sin decimales (COP)
  }

  payload +=
    tlv('58', PAIS_CO) +
    tlv('59', limpiar(nombre, 25) || 'COMERCIO') +
    tlv('60', limpiar(ciudad || 'COLOMBIA', 15));

  if (referencia) {
    // Additional Data Field Template (tag 62) → Bill/Reference Number (01).
    payload += tlv('62', tlv('05', limpiar(referencia, 25)));
  }

  // CRC: se calcula sobre todo lo anterior + "6304".
  payload += '63' + '04';
  payload += crc16(payload);
  return payload;
}

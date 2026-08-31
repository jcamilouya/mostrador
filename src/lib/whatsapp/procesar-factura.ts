import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje, descargarImagenMeta } from './send';

const CATEGORIA_EMOJI: Record<string, string> = {
  proveedores: '📦', arriendo: '🏠', servicios: '💡',
  nomina: '👥', impuestos: '🏛️', transporte: '🚚',
  mantenimiento: '🔧', otros: '📋',
};

type DatosFactura = {
  proveedor: string | null;
  monto: number;
  fecha: string | null;
  categoria: string;
  descripcion: string | null;
  confianza: 'alta' | 'media' | 'baja';
};

export async function procesarFactura(
  empresaId: string,
  numeroDueno: string,
  imageId: string,
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let imageBase64: string;
  try {
    imageBase64 = await descargarImagenMeta(imageId);
  } catch {
    await enviarMensaje(numeroDueno, 'No pude descargar la foto 😓 Intenta de nuevo.');
    return;
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
        },
        {
          type: 'text',
          text: `Eres un asistente que extrae datos de facturas para un negocio colombiano.
Analiza esta imagen y responde SOLO con un JSON con este formato exacto:
{
  "proveedor": "nombre del proveedor",
  "monto": 0,
  "fecha": "YYYY-MM-DD",
  "categoria": "proveedores|arriendo|servicios|nomina|impuestos|transporte|mantenimiento|otros",
  "descripcion": "breve descripción",
  "confianza": "alta|media|baja"
}
Si no puedes leer algún campo usa null. Si no es una factura responde: {"error": "no_es_factura"}`,
        },
      ],
    }],
  });

  // Primer bloque de TEXTO, no content[0] (ver leer-factura).
  const raw = response.content.find((b) => b.type === 'text')?.text ?? '';

  let datos: DatosFactura & { error?: string };
  try {
    datos = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    await enviarMensaje(numeroDueno, 'No pude leer bien esa imagen 😅 ¿Puedes enviar otra más clara y con buena luz?');
    return;
  }

  if ('error' in datos) {
    await enviarMensaje(numeroDueno, 'Eso no parece una factura 🤔 Envíame la foto de una factura o recibo de un proveedor.');
    return;
  }

  const montoFormateado = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(datos.monto);

  // Guardar como egreso pendiente de confirmación
  const admin = createAdminClient();
  await admin.from('egresos_pendientes_whatsapp').insert({
    empresa_id: empresaId,
    numero_whatsapp: numeroDueno,
    datos_ia: datos,
    estado: 'pendiente',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  const emoji = CATEGORIA_EMOJI[datos.categoria] ?? '📄';
  await enviarMensaje(
    numeroDueno,
    `${emoji} *Factura detectada*\n\n` +
    `📌 Proveedor: *${datos.proveedor ?? 'No detectado'}*\n` +
    `💰 Monto: *${montoFormateado}*\n` +
    `📅 Fecha: *${datos.fecha ?? 'No detectada'}*\n` +
    `🏷️ Categoría: *${datos.categoria}*\n` +
    (datos.descripcion ? `📝 ${datos.descripcion}\n` : '') +
    `\n¿Confirmas? Responde *SI* para guardar o *NO* para cancelar.`,
  );
}

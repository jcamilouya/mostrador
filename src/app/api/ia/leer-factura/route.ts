import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Formato inválido' }, { status: 400 });
  }

  const file = formData.get('imagen') as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Sin imagen' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'La imagen debe pesar menos de 5 MB' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mediaType = (
    file.type === 'image/png' ? 'image/png'
    : file.type === 'image/webp' ? 'image/webp'
    : file.type === 'image/gif' ? 'image/gif'
    : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  // Sin llave configurada la lectura no puede funcionar: decirlo claro en vez
  // de reventar con un error técnico en la cara del dueño.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: 'La lectura automática no está configurada. Escribe el gasto a mano por ahora.',
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Eres un asistente que extrae datos de facturas para un negocio colombiano.
Analiza esta imagen y responde SOLO con un JSON con este formato exacto:
{
  "proveedor": "nombre del proveedor o empresa",
  "monto": 0,
  "fecha": "YYYY-MM-DD",
  "categoria": "proveedores|arriendo|servicios|nomina|impuestos|transporte|mantenimiento|otros",
  "descripcion": "descripción breve de lo que se compró",
  "confianza": "alta|media|baja",
  "ingredientes": [
    { "nombre": "tomate", "cantidad": 5, "unidad": "unidad", "costo_total": 5000 }
  ]
}
Reglas:
- monto y costo_total siempre en pesos colombianos sin puntos ni comas (solo dígitos).
- Si no puedes leer algún campo usa null.
- "ingredientes": un renglón por cada producto físico/materia prima comprado, con su cantidad. "unidad" DEBE ser una de: "unidad", "g", "kg", "lb", "ml", "L" (elige la que mejor represente lo comprado; si no sabes usa "unidad"). "costo_total" es el precio total de ese renglón (o null si no se ve). Si la factura es de un servicio (arriendo, luz, agua, nómina…) o no tiene productos con cantidades, devuelve "ingredientes": [].
- Si no es una factura responde: {"error": "no_es_factura"}`,
          },
        ],
      }],
    });
  } catch (e) {
    // La IA se cayó, se demoró o se acabó el saldo. El gasto se puede escribir
    // a mano: nunca dejar la pantalla rota por esto.
    console.error('[leer-factura] Anthropic', e);
    return NextResponse.json({
      ok: false,
      error: 'No pudimos leer la foto en este momento. Intenta de nuevo o escribe el gasto a mano.',
    });
  }

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Claude no pudo interpretar la imagen. Intenta con mejor iluminación.' });
  }

  if (datos.error === 'no_es_factura') {
    return NextResponse.json({ ok: false, error: 'Eso no parece una factura. Envía la foto de un recibo o factura de compra.' });
  }

  return NextResponse.json({ ok: true, datos });
}

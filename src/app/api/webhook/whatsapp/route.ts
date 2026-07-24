import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { procesarFactura } from '@/lib/whatsapp/procesar-factura';
import { confirmarEgresoPendiente, cancelarEgresoPendiente } from '@/lib/whatsapp/confirmar-egreso';
import { enviarMensaje } from '@/lib/whatsapp/send';

// GET — verificación del webhook con Meta
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// POST — recibir mensajes de WhatsApp
export async function POST(req: Request) {
  const rawBody = await req.text();

  // FAIL-CLOSED: verificar la firma HMAC de Meta (X-Hub-Signature-256) con el
  // App Secret. Sin el secreto no se procesa: evita que cualquiera que conozca
  // el número del negocio inyecte gastos o dispare la IA (costo/DoS).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ ok: false, error: 'Webhook no configurado' }, { status: 503 });
  }
  const firma = req.headers.get('x-hub-signature-256') ?? '';
  const esperado =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  if (
    firma.length !== esperado.length ||
    !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))
  ) {
    return new NextResponse(null, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const entry = (body?.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
  const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
  const value = changes?.value as Record<string, unknown> | undefined;
  const mensaje = (value?.messages as unknown[])?.[0] as Record<string, unknown> | undefined;

  // Ignorar notificaciones sin mensaje (ej: estados de entrega)
  if (!mensaje) return NextResponse.json({ ok: true });

  const numeroDueno = mensaje.from as string;
  const tipo = mensaje.type as string;

  // Buscar empresa por número de WhatsApp
  const admin = createAdminClient();
  const { data: empresas } = await admin
    .from('empresas')
    .select('id, nombre, whatsapp_numero');

  const numero = numeroDueno.replace(/[^\d]/g, '');
  const empresa = empresas?.find(
    (e) => e.whatsapp_numero && e.whatsapp_numero.replace(/[^\d]/g, '') === numero,
  );

  if (!empresa) {
    await enviarMensaje(
      numeroDueno,
      '¡Hola! 👋 Este número no está vinculado a ningún negocio en Mostrador.\n\n' +
      'Entra a tu app → Configuración → WhatsApp y registra tu número para empezar.',
    );
    return NextResponse.json({ ok: true });
  }

  // Imagen → Claude Vision → egreso pendiente
  if (tipo === 'image') {
    const imageId = (mensaje.image as Record<string, string>).id;
    await procesarFactura(empresa.id, numeroDueno, imageId);
    return NextResponse.json({ ok: true });
  }

  // Texto → confirmar o cancelar egreso pendiente
  if (tipo === 'text') {
    const texto = ((mensaje.text as Record<string, string>).body ?? '').trim().toUpperCase();
    if (texto === 'SI' || texto === 'SÍ' || texto === 'S') {
      await confirmarEgresoPendiente(empresa.id, numeroDueno);
    } else if (texto === 'NO' || texto === 'N') {
      await cancelarEgresoPendiente(empresa.id, numeroDueno);
    } else {
      await enviarMensaje(
        numeroDueno,
        '📸 Mándame la foto de una factura o recibo y la registro por ti.\n\nSi tienes una pendiente de confirmar, responde *SI* o *NO*.',
      );
    }
  }

  return NextResponse.json({ ok: true });
}

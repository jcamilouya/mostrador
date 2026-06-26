import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarChecksum, mapearEstadoWompi } from '@/lib/payments/wompi';

export const runtime = 'nodejs';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/webhook/wompi
 * Notificación de Wompi. SOLO aquí se activa el plan, tras verificar la firma.
 * Nunca confiar en el navegador para dar acceso.
 */
export async function POST(req: Request) {
  // Rule 10 — límite de tamaño del cuerpo
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > 256 * 1024) return new NextResponse(null, { status: 413 });

  const rawBody = await req.text();
  let event: {
    event?: string;
    timestamp?: number;
    signature?: { checksum?: string; properties?: string[] };
    data?: { transaction?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Rule 3 — verificar firma
  if (!verificarChecksum(event)) return new NextResponse(null, { status: 400 });

  // Rule 9 — ventana de tiempo (evita reenvíos viejos)
  const ahoraS = Math.floor(Date.now() / 1000);
  if (event.timestamp === undefined || Math.abs(ahoraS - event.timestamp) > 600) {
    return new NextResponse(null, { status: 400 });
  }

  const tx = event.data?.transaction;
  if (event.event !== 'transaction.updated' || !tx) {
    return NextResponse.json({ received: true });
  }

  const txId = String(tx.id ?? '');
  const referencia = String(tx.reference ?? '');
  const estadoWompi = String(tx.status ?? '');
  const metodo = tx.payment_method_type ? String(tx.payment_method_type) : null;

  // Rule 6 — loguear solo identificadores/estado, nunca datos sensibles
  console.log('[wompi.webhook]', { event: event.event, txId, estado: estadoWompi });

  const admin = createAdminClient();

  // Buscar el pago por su referencia
  const { data: pago } = await admin
    .from('pagos')
    .select('id, empresa_id, plan, estado')
    .eq('referencia', referencia)
    .maybeSingle();

  // Pago desconocido o ya confirmado → responder 200 (idempotente)
  if (!pago || pago.estado === 'succeeded') {
    await registrarEvento(admin, txId, event.timestamp);
    return NextResponse.json({ received: true });
  }

  const estadoInterno = mapearEstadoWompi(estadoWompi);

  await admin
    .from('pagos')
    .update({
      estado: estadoInterno,
      wompi_transaccion_id: txId,
      metodo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pago.id);

  // Solo al APROBARSE se activa/renueva el plan 30 días
  if (estadoInterno === 'succeeded') {
    const ahora = new Date();
    const { data: emp } = await admin
      .from('empresas')
      .select('plan_expira_en')
      .eq('id', pago.empresa_id)
      .maybeSingle();
    const actual = emp?.plan_expira_en ? new Date(emp.plan_expira_en) : null;
    const base = actual && actual > ahora ? actual : ahora; // apila renovaciones
    const nuevaVence = new Date(base.getTime() + 30 * UN_DIA_MS);

    await admin
      .from('empresas')
      .update({
        plan: pago.plan,
        plan_expira_en: nuevaVence.toISOString(),
        updated_at: ahora.toISOString(),
      })
      .eq('id', pago.empresa_id);
  }

  await registrarEvento(admin, txId, event.timestamp);
  return NextResponse.json({ received: true });
}

/** Registra el evento procesado (idempotencia best-effort). */
async function registrarEvento(
  admin: ReturnType<typeof createAdminClient>,
  txId: string,
  timestamp: number,
): Promise<void> {
  try {
    await admin.from('wompi_eventos').insert({ event_id: `wompi:${txId}:${timestamp}` });
  } catch {
    // Duplicado o error no crítico — el plan ya es idempotente por estado del pago.
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { descontarIngredientesPorVenta } from '@/lib/insumos/consumo';

/**
 * Webhook de notificaciones de pago de Bancolombia Cobros QR.
 *
 * Bancolombia envía un JWT firmado con el pago confirmado. En producción
 * configura BANCOLOMBIA_WEBHOOK_SECRET con la clave que entrega Bancolombia.
 *
 * POST https://tu-app.vercel.app/api/webhook/bancolombia
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!rawBody) return NextResponse.json({ ok: true });

  // Verificación de firma — cuando Bancolombia entregue la clave/certificado,
  // activar la verificación JWT aquí. Por ahora solo en sandbox sin firma.
  const secret = process.env.BANCOLOMBIA_WEBHOOK_SECRET;
  if (secret) {
    // TODO: verificar JWT con la clave de Bancolombia
    // Los headers de firma varían según la versión de su API; consultar docs.
    const firma = req.headers.get('x-bancolombia-signature') ?? req.headers.get('authorization');
    if (!firma) {
      return NextResponse.json({ ok: false, error: 'Sin firma' }, { status: 401 });
    }
  }

  let notif: Record<string, unknown>;
  try {
    // Bancolombia puede enviar JWT o JSON plano dependiendo de la configuración
    if (rawBody.startsWith('{')) {
      notif = JSON.parse(rawBody) as Record<string, unknown>;
    } else {
      // Decodificar payload de JWT sin verificar (solo sandbox)
      const parts = rawBody.split('.');
      if (parts.length !== 3) throw new Error('Formato inesperado');
      const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
      notif = JSON.parse(payload) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 });
  }

  // Bancolombia puede usar distintos nombres de campo para el ID de transacción
  const transaccionId =
    (notif.transaccionId ?? notif.qrId ?? notif.referencia ?? notif.reference) as string | undefined;

  if (!transaccionId) {
    console.warn('[Webhook Bancolombia] Notificación sin transaccionId:', notif);
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  // Buscar la venta por breb_transaccion_id
  const { data: venta } = await admin
    .from('ventas')
    .select('id, empresa_id, estado, numero_venta')
    .eq('breb_transaccion_id', transaccionId)
    .eq('estado', 'pendiente')
    .maybeSingle();

  if (!venta) {
    // Puede ser una notificación duplicada o ya confirmada — responder 200 de todas formas
    return NextResponse.json({ ok: true });
  }

  // Marcar la venta como completada
  const { error } = await admin
    .from('ventas')
    .update({ estado: 'completada', breb_estado: 'confirmado' })
    .eq('id', venta.id);

  if (error) {
    console.error('[Webhook Bancolombia] Error al confirmar venta:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Descontar stock de los items de la venta confirmada
  const { data: items } = await admin
    .from('venta_items')
    .select('producto_id, cantidad')
    .eq('venta_id', venta.id);

  for (const item of items ?? []) {
    if (!item.producto_id) continue;
    const { data: prod } = await admin
      .from('productos')
      .select('stock_actual')
      .eq('id', item.producto_id)
      .single();
    const stockNuevo = Math.max(0, (prod?.stock_actual ?? 0) - item.cantidad);
    await admin
      .from('productos')
      .update({ stock_actual: stockNuevo, updated_at: new Date().toISOString() })
      .eq('id', item.producto_id);
    await admin.from('movimientos_inventario').insert({
      empresa_id: venta.empresa_id,
      producto_id: item.producto_id,
      tipo: 'salida',
      cantidad: item.cantidad,
      referencia_tipo: 'venta',
      referencia_id: venta.id,
      notas: `Venta confirmada por Bancolombia QR (${transaccionId})`,
    });
  }

  // Descontar ingredientes de la venta confirmada (según recetas).
  await descontarIngredientesPorVenta(
    admin,
    venta.empresa_id,
    venta.id,
    venta.numero_venta ?? '',
    (items ?? [])
      .filter((it) => it.producto_id)
      .map((it) => ({ producto_id: it.producto_id as string, cantidad: it.cantidad })),
  );

  return NextResponse.json({ ok: true });
}

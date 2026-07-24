import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  ajustarStockProducto,
} from '@/lib/insumos/consumo';

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

  // FAIL-CLOSED: sin el secreto configurado NO se procesa nada (la integración
  // Bre-B/Bancolombia está inactiva). Esto evita que un tercero que adivine un
  // breb_transaccion_id marque ventas como pagadas sin que entre dinero.
  const secret = process.env.BANCOLOMBIA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Webhook no configurado' }, { status: 503 });
  }
  // TODO(producción): verificar la firma/JWT real de Bancolombia con `secret`
  // (crypto.timingSafeEqual) ANTES de tocar la BD. Mientras tanto exigimos al
  // menos que llegue el header de firma.
  const firma = req.headers.get('x-bancolombia-signature') ?? req.headers.get('authorization');
  if (!firma) {
    return NextResponse.json({ ok: false, error: 'Sin firma' }, { status: 401 });
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

  // Marcar completada SOLO si sigue pendiente (evita doble descuento si la
  // confirmación manual la completó primero).
  const { data: completadas, error } = await admin
    .from('ventas')
    .update({ estado: 'completada', breb_estado: 'confirmado' })
    .eq('id', venta.id)
    .eq('estado', 'pendiente')
    .select('id');

  if (error) {
    console.error('[Webhook Bancolombia] Error al confirmar venta:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!completadas || completadas.length === 0) {
    return NextResponse.json({ ok: true }); // ya confirmada por otra vía
  }

  // Descontar stock de los items de la venta confirmada
  const { data: items } = await admin
    .from('venta_items')
    .select('producto_id, cantidad')
    .eq('venta_id', venta.id);

  for (const item of items ?? []) {
    if (!item.producto_id) continue;
    await ajustarStockProducto(admin, venta.empresa_id, item.producto_id, -item.cantidad);
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

  // Descontar las bebidas elegidas por línea (degrada si falta la migración 008).
  const { data: bebidaItems } = await admin
    .from('venta_items')
    .select('insumo_extra_id, cantidad')
    .eq('venta_id', venta.id)
    .not('insumo_extra_id', 'is', null);
  await descontarInsumosVendidos(
    admin,
    venta.empresa_id,
    venta.id,
    venta.numero_venta ?? '',
    (bebidaItems ?? []).map((it) => ({
      insumo_id: it.insumo_extra_id as string,
      cantidad: it.cantidad,
    })),
  );

  return NextResponse.json({ ok: true });
}

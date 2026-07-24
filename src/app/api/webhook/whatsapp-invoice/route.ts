import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORIAS_EGRESO } from '@/lib/egresos/schemas';

/** Compara dos strings en tiempo constante (evita oráculos de timing). */
function secretosIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const payloadSchema = z.object({
  numero_emisor: z.string().min(5),
  proveedor: z.string().max(120).optional().nullable(),
  monto: z.number().positive(),
  fecha: z.string().optional().nullable(),
  categoria: z.enum(CATEGORIAS_EGRESO).optional().nullable(),
  descripcion: z.string().max(500).optional().nullable(),
  comprobante_url: z.string().url().optional().nullable(),
});

function normalizarNumero(n: string): string {
  return n.replace(/[^\d]/g, '');
}

export async function POST(request: Request) {
  // Auth por header secret (comparación en tiempo constante, fail-closed).
  const secret = request.headers.get('x-webhook-secret');
  const esperado = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || !esperado || !secretosIguales(secret, esperado)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const numeroNorm = normalizarNumero(parsed.data.numero_emisor);

  // Buscar empresa por whatsapp_numero (comparando normalizado)
  const { data: empresas } = await admin
    .from('empresas')
    .select('id, whatsapp_numero, nombre');

  const empresa = empresas?.find(
    (e) => e.whatsapp_numero && normalizarNumero(e.whatsapp_numero) === numeroNorm,
  );

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: 'numero no vinculado a ninguna empresa' },
      { status: 404 },
    );
  }

  // Detectar duplicado (mismo proveedor + monto + fecha en últimos 7 días)
  const fechaEgreso = parsed.data.fecha ?? new Date().toISOString().slice(0, 10);
  const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: posibleDup } = await admin
    .from('egresos')
    .select('id, fecha')
    .eq('empresa_id', empresa.id)
    .eq('monto', parsed.data.monto)
    .eq('proveedor', parsed.data.proveedor ?? null)
    .gte('fecha', semanaAtras)
    .limit(1);

  if (posibleDup && posibleDup.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'duplicate',
      duplicate_of: posibleDup[0].id,
      empresa_nombre: empresa.nombre,
    });
  }

  const { data: egreso, error } = await admin
    .from('egresos')
    .insert({
      empresa_id: empresa.id,
      categoria: parsed.data.categoria ?? 'proveedores',
      proveedor: parsed.data.proveedor ?? null,
      descripcion: parsed.data.descripcion ?? null,
      monto: parsed.data.monto,
      fecha: fechaEgreso,
      metodo_pago: 'efectivo',
      comprobante_url: parsed.data.comprobante_url ?? null,
      fuente: 'whatsapp_ia',
    })
    .select('id, monto, proveedor, categoria, fecha')
    .single();

  if (error || !egreso) {
    return NextResponse.json(
      { ok: false, error: 'no se pudo guardar el egreso' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    egreso_id: egreso.id,
    empresa_id: empresa.id,
    empresa_nombre: empresa.nombre,
    resumen: {
      proveedor: egreso.proveedor,
      categoria: egreso.categoria,
      monto: Number(egreso.monto),
      fecha: egreso.fecha,
    },
  });
}

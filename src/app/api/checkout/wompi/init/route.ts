import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRECIOS } from '@/lib/plan/queries';
import { firmaIntegridad } from '@/lib/payments/wompi';

export const runtime = 'nodejs';

type PlanComprable = 'basico' | 'pro';

/**
 * POST /api/checkout/wompi/init
 * Crea un pago PENDIENTE y devuelve lo que el Widget de Wompi necesita.
 * El plan NO se activa aquí: se activa en el webhook al confirmar Wompi.
 */
export async function POST(req: Request) {
  // 0. Si Wompi no está configurado, el cobro queda "dormido" (sin error).
  if (!process.env.WOMPI_PUBLIC_KEY || !process.env.WOMPI_INTEGRITY_SECRET) {
    return NextResponse.json({ disponible: false });
  }

  // 1. Validar sesión y resolver la empresa del usuario
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) {
    return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });
  }

  // 2. Validar el plan solicitado
  let plan: PlanComprable;
  try {
    const body = (await req.json()) as { plan?: string };
    plan = body.plan === 'basico' ? 'basico' : 'pro';
  } catch {
    plan = 'pro';
  }

  const montoCentavos = PRECIOS[plan] * 100; // PRECIOS está en COP enteros
  const referencia = `mostrador_${randomUUID()}`;
  const firma = firmaIntegridad(referencia, montoCentavos);

  // 3. Registrar el intento de pago (pendiente)
  const admin = createAdminClient();
  const { error } = await admin.from('pagos').insert({
    empresa_id: usuario.empresa_id,
    plan,
    referencia,
    monto_centavos: montoCentavos,
    estado: 'pending',
  });
  if (error) {
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  return NextResponse.json({
    referencia,
    montoCentavos,
    moneda: 'COP',
    firmaIntegridad: firma,
    llavePublica: process.env.WOMPI_PUBLIC_KEY ?? '',
    redirectUrl: `${baseUrl}/checkout/wompi/return`,
  });
}

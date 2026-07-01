import { createClient } from '@/lib/supabase/server';

export type Plan = 'basico' | 'pro' | 'trial';

export type PlanInfo = {
  plan: Plan;
  expiraEn: string | null;
  diasRestantes: number | null; // solo en trial
  esPro: boolean; // acceso a features Pro (trial activo cuenta como Pro)
  trialActivo: boolean;
  bloqueado: boolean; // trial vencido sin plan pagado → bloqueo suave
};

export const PRECIOS = {
  basico: 19900,
  pro: 35900,
} as const;

export const FEATURES = {
  basico: [
    'POS y ventas ilimitadas',
    'Inventario y productos',
    'Ingresos y gastos',
    'Dashboard del día',
    '1 número de WhatsApp',
  ],
  pro: [
    'Todo lo del plan Básico',
    'Analítica avanzada (horas pico, márgenes)',
    'Cobros con Bre-B sin comisión',
    'Reportes PDF y Excel',
    'Alertas de stock bajo',
  ],
} as const;

function calc(plan: Plan, expiraEn: string | null): PlanInfo {
  const ahora = Date.now();
  const venceMs = expiraEn ? new Date(expiraEn).getTime() : null;
  const dias = venceMs ? Math.max(0, Math.ceil((venceMs - ahora) / 86_400_000)) : null;

  // Un plan de pago SIN fecha de vencimiento se considera vigente (cortesía /
  // asignación manual). Solo se bloquea si tiene fecha y ya pasó. El modelo es
  // "pago que dura 30 días y se renueva" (Wompi no tiene débito automático).
  const vencido = venceMs !== null && venceMs <= ahora;

  if (plan === 'pro') {
    return { plan, expiraEn, diasRestantes: dias, esPro: !vencido, trialActivo: false, bloqueado: vencido };
  }

  if (plan === 'basico') {
    // Básico desbloquea el core (POS, inventario, etc.) pero NO las funciones Pro.
    return { plan, expiraEn, diasRestantes: dias, esPro: false, trialActivo: false, bloqueado: vencido };
  }

  // trial: cuenta como Pro mientras esté vigente; al vencer, bloqueo suave.
  const activo = venceMs !== null && venceMs > ahora;
  return {
    plan,
    expiraEn,
    diasRestantes: dias ?? 0,
    esPro: activo,
    trialActivo: activo,
    bloqueado: !activo,
  };
}

export async function getPlanInfo(empresaId: string): Promise<PlanInfo> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('empresas')
    .select('plan, plan_expira_en')
    .eq('id', empresaId)
    .maybeSingle();
  return calc((data?.plan as Plan) ?? 'trial', data?.plan_expira_en ?? null);
}

/** Versión que resuelve la empresa del usuario autenticado. Devuelve null si no hay sesión/empresa. */
export async function getPlanInfoDelUsuario(): Promise<PlanInfo | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) return null;
  return getPlanInfo(usuario.empresa_id);
}

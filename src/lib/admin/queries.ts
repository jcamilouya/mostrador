import { createAdminClient } from '@/lib/supabase/admin';
import { PRECIOS, type Plan } from '@/lib/plan/queries';

const DAY = 86_400_000;

export type EstadoSuscripcion =
  | 'trial_activo'
  | 'trial_vencido'
  | 'basico'
  | 'basico_vencido'
  | 'pro'
  | 'pro_vencido';

export type EmpresaResumen = {
  id: string;
  nombre: string;
  nit: string | null;
  email: string;
  telefono: string | null;
  direccion: string | null;
  plan: Plan;
  planExpiraEn: string | null;
  createdAt: string;
  whatsappNumero: string | null;
  brebMerchantId: string | null;
  brebBanco: string | null;
  brebConfigurado: boolean;
  notasInternas: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  ventasCount: number;
  ventasMonto: number;
  primeraVenta: string | null;
  ultimaVenta: string | null;
  productosCount: number;
  egresosCount: number;
  egresosMonto: number;
  clientesCount: number;
  // derivados
  estado: EstadoSuscripcion;
  diasRestantes: number | null; // días hasta el vencimiento (trial o plan de pago)
  activa: boolean; // venta en últimos 30 días
};

type RpcRow = {
  id: string;
  nombre: string;
  nit: string | null;
  email: string;
  telefono: string | null;
  direccion: string | null;
  plan: string;
  plan_expira_en: string | null;
  created_at: string;
  whatsapp_numero: string | null;
  breb_merchant_id: string | null;
  breb_banco: string | null;
  notas_internas: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  ventas_count: number;
  ventas_monto: number | null;
  primera_venta: string | null;
  ultima_venta: string | null;
  productos_count: number;
  egresos_count: number;
  egresos_monto: number | null;
  clientes_count: number;
};

function mapRow(r: RpcRow): EmpresaResumen {
  const plan = (r.plan as Plan) ?? 'trial';
  const ahora = Date.now();
  const venceMs = r.plan_expira_en ? new Date(r.plan_expira_en).getTime() : null;
  const diasRestantes = venceMs ? Math.max(0, Math.ceil((venceMs - ahora) / DAY)) : null;
  // Un plan de pago SIN fecha se considera vigente (cortesía/manual). Solo se
  // marca vencido cuando tiene fecha y ya pasó. (Coincide con lib/plan/queries.)
  const vencido = venceMs !== null && venceMs <= ahora;

  let estado: EstadoSuscripcion;
  if (plan === 'pro') {
    estado = vencido ? 'pro_vencido' : 'pro';
  } else if (plan === 'basico') {
    estado = vencido ? 'basico_vencido' : 'basico';
  } else {
    // trial sin fecha o ya pasada → vencido
    estado = venceMs !== null && venceMs > ahora ? 'trial_activo' : 'trial_vencido';
  }

  const activa = r.ultima_venta ? ahora - new Date(r.ultima_venta).getTime() < 30 * DAY : false;

  return {
    id: r.id,
    nombre: r.nombre,
    nit: r.nit,
    email: r.email,
    telefono: r.telefono,
    direccion: r.direccion,
    plan,
    planExpiraEn: r.plan_expira_en,
    createdAt: r.created_at,
    whatsappNumero: r.whatsapp_numero,
    brebMerchantId: r.breb_merchant_id,
    brebBanco: r.breb_banco,
    brebConfigurado: Boolean(r.breb_merchant_id && r.breb_merchant_id.trim()),
    notasInternas: r.notas_internas,
    usuarioId: r.usuario_id,
    usuarioNombre: r.usuario_nombre,
    usuarioEmail: r.usuario_email,
    ventasCount: Number(r.ventas_count),
    ventasMonto: Number(r.ventas_monto ?? 0),
    primeraVenta: r.primera_venta,
    ultimaVenta: r.ultima_venta,
    productosCount: Number(r.productos_count),
    egresosCount: Number(r.egresos_count),
    egresosMonto: Number(r.egresos_monto ?? 0),
    clientesCount: Number(r.clientes_count),
    estado,
    diasRestantes,
    activa,
  };
}

export async function getEmpresasResumen(): Promise<EmpresaResumen[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_empresas_resumen', { p_empresa_id: null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RpcRow[]).map(mapRow);
}

export async function getEmpresaResumen(id: string): Promise<EmpresaResumen | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('admin_empresas_resumen', { p_empresa_id: id });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RpcRow[];
  return rows.length ? mapRow(rows[0]) : null;
}

export type OverviewStats = {
  total: number;
  nuevasMes: number;
  nuevasSemana: number;
  porPlan: { trial: number; basico: number; pro: number };
  trialActivos: number;
  trialPorVencer: number; // <= 7 días
  trialVencidos: number;
  pagando: number; // planes de pago VIGENTES (básico + pro)
  pagandoPro: number;
  pagandoBasico: number;
  pagosVencidos: number; // planes de pago que ya vencieron (para renovar)
  mrr: number; // solo cuenta planes vigentes
  activas: number; // venta en últimos 30 días
  zombies: number; // nunca vendieron
  conversion: number; // % pagando / (pagando + trial vencidos)
};

export function calcOverview(empresas: EmpresaResumen[]): OverviewStats {
  const now = Date.now();
  const porPlan = { trial: 0, basico: 0, pro: 0 };
  let nuevasMes = 0;
  let nuevasSemana = 0;
  let trialActivos = 0;
  let trialPorVencer = 0;
  let trialVencidos = 0;
  let pagandoPro = 0;
  let pagandoBasico = 0;
  let pagosVencidos = 0;
  let activas = 0;
  let zombies = 0;
  let mrr = 0;

  for (const e of empresas) {
    porPlan[e.plan]++;
    const edad = now - new Date(e.createdAt).getTime();
    if (edad < 30 * DAY) nuevasMes++;
    if (edad < 7 * DAY) nuevasSemana++;
    if (e.estado === 'trial_activo') {
      trialActivos++;
      if ((e.diasRestantes ?? 99) <= 7) trialPorVencer++;
    }
    if (e.estado === 'trial_vencido') trialVencidos++;
    // Solo los planes VIGENTES cuentan como ingreso.
    if (e.estado === 'pro') {
      pagandoPro++;
      mrr += PRECIOS.pro;
    } else if (e.estado === 'basico') {
      pagandoBasico++;
      mrr += PRECIOS.basico;
    } else if (e.estado === 'pro_vencido' || e.estado === 'basico_vencido') {
      pagosVencidos++;
    }
    if (e.activa) activas++;
    if (e.ventasCount === 0) zombies++;
  }

  const pagando = pagandoBasico + pagandoPro;
  const base = pagando + trialVencidos;
  const conversion = base > 0 ? Math.round((pagando / base) * 100) : 0;

  return {
    total: empresas.length,
    nuevasMes,
    nuevasSemana,
    porPlan,
    trialActivos,
    trialPorVencer,
    trialVencidos,
    pagando,
    pagandoPro,
    pagandoBasico,
    pagosVencidos,
    mrr,
    activas,
    zombies,
    conversion,
  };
}

export type AdminLogEntry = {
  id: string;
  adminEmail: string;
  accion: string;
  detalle: unknown;
  createdAt: string;
};

export async function getAdminLog(empresaId: string, limit = 30): Promise<AdminLogEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('admin_log')
    .select('id, admin_email, accion, detalle, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    adminEmail: r.admin_email as string,
    accion: r.accion as string,
    detalle: r.detalle,
    createdAt: r.created_at as string,
  }));
}

export type PagoEmpresa = {
  id: string;
  plan: string;
  montoCentavos: number;
  estado: string; // pending | succeeded | failed
  metodo: string | null;
  createdAt: string;
};

/** Historial de intentos de pago Wompi de una empresa (para ver si pagó). */
export async function getPagosEmpresa(empresaId: string, limit = 10): Promise<PagoEmpresa[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('pagos')
    .select('id, plan, monto_centavos, estado, metodo, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    plan: r.plan as string,
    montoCentavos: Number(r.monto_centavos),
    estado: r.estado as string,
    metodo: (r.metodo as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** Último inicio de sesión del dueño (vía Supabase Auth Admin API). */
export async function getUltimoLogin(usuarioId: string | null): Promise<string | null> {
  if (!usuarioId) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(usuarioId);
    return data.user?.last_sign_in_at ?? null;
  } catch {
    return null;
  }
}

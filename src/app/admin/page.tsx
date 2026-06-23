import type { Metadata } from 'next';
import Link from 'next/link';
import { TrendingUp, Building2, CreditCard, Hourglass, AlertTriangle, Activity, Ghost, Percent } from 'lucide-react';
import { getEmpresasResumen, calcOverview } from '@/lib/admin/queries';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import { EstadoBadge } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Resumen — Panel Admin' };

export default async function AdminOverviewPage() {
  const empresas = await getEmpresasResumen();
  const s = calcOverview(empresas);

  const porVencer = empresas
    .filter((e) => e.estado === 'trial_activo' && (e.diasRestantes ?? 99) <= 7)
    .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
        <p className="text-sm text-muted-foreground">El estado del negocio de un vistazo.</p>
      </header>

      {/* MRR destacado */}
      <div
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: 'color-mix(in oklch, var(--utilidad) 12%, var(--card))' }}
      >
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--utilidad)' }}>
          <TrendingUp className="h-4 w-4" /> MRR estimado
        </div>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{formatCOP(s.mrr)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(s.pagando)} empresa{s.pagando === 1 ? '' : 's'} pagando · conversión {s.conversion}%
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={<Building2 className="h-4 w-4" />} label="Empresas" valor={formatNumber(s.total)} sub={`+${s.nuevasMes} este mes`} />
        <Kpi icon={<CreditCard className="h-4 w-4" />} label="Pagando" valor={formatNumber(s.pagando)} sub={`${s.porPlan.pro} pro · ${s.porPlan.basico} básico`} />
        <Kpi icon={<Hourglass className="h-4 w-4" />} label="En prueba" valor={formatNumber(s.trialActivos)} sub={`${s.trialPorVencer} por vencer`} color="var(--ingreso)" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Pruebas vencidas" valor={formatNumber(s.trialVencidos)} sub="sin convertir" color={s.trialVencidos > 0 ? 'var(--egreso)' : undefined} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Activas (30d)" valor={formatNumber(s.activas)} sub="con ventas recientes" />
        <Kpi icon={<Ghost className="h-4 w-4" />} label="Sin actividad" valor={formatNumber(s.zombies)} sub="nunca vendieron" color={s.zombies > 0 ? 'var(--egreso)' : undefined} />
        <Kpi icon={<Percent className="h-4 w-4" />} label="Conversión" valor={`${s.conversion}%`} sub="prueba → pago" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Nuevas (7d)" valor={formatNumber(s.nuevasSemana)} sub="esta semana" />
      </div>

      {/* Trials por vencer */}
      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Pruebas por vencer (7 días)</h2>
          <Link href="/admin/empresas?estado=trial_activo" className="text-xs text-muted-foreground hover:underline">
            Ver todas
          </Link>
        </div>
        {porVencer.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna prueba vence en los próximos 7 días. 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {porVencer.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/empresas/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-70">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.usuarioEmail ?? e.email}</p>
                  </div>
                  <EstadoBadge estado={e.estado} diasRestantes={e.diasRestantes} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  valor,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" style={color ? { color } : undefined}>
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums" style={color ? { color } : undefined}>
        {valor}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

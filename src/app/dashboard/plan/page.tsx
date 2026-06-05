import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getPlanInfo, PRECIOS, FEATURES } from '@/lib/plan/queries';
import { UpgradeButton } from '@/components/plan/UpgradeButton';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Plan — Mostrador',
};

export default async function PlanPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const plan = await getPlanInfo(empresaId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Tu plan</h1>
        <p className="text-sm text-muted-foreground">
          Empieza gratis. Mejora cuando tu negocio lo pida.
        </p>
      </header>

      <EstadoActual plan={plan} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlanCard
          nombre="Básico"
          precio={PRECIOS.basico}
          features={FEATURES.basico}
          activo={plan.plan === 'basico'}
        />
        <PlanCard
          nombre="Pro"
          precio={PRECIOS.pro}
          features={FEATURES.pro}
          destacado
          activo={plan.plan === 'pro'}
          cta={<UpgradeButton />}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Con Bre-B en Pro ahorras las comisiones del datáfono (hasta 2.99% por venta). La
        suscripción se paga sola.
      </p>
    </div>
  );
}

function EstadoActual({
  plan,
}: {
  plan: Awaited<ReturnType<typeof getPlanInfo>>;
}) {
  let titulo: string;
  let detalle: string;
  let color = 'var(--ingreso)';

  if (plan.plan === 'pro') {
    titulo = 'Estás en Pro';
    detalle = 'Tienes acceso a todo. ¡A darle!';
  } else if (plan.plan === 'trial' && plan.trialActivo) {
    titulo = `Prueba gratis — ${plan.diasRestantes} día${plan.diasRestantes === 1 ? '' : 's'} restantes`;
    detalle = 'Disfrutas todas las funciones Pro durante tu prueba.';
    color = 'var(--utilidad)';
  } else if (plan.plan === 'trial' && !plan.trialActivo) {
    titulo = 'Tu prueba gratis terminó';
    detalle = 'Mejora tu plan para volver a vender y desbloquear todo.';
    color = 'var(--egreso)';
  } else {
    titulo = 'Estás en el plan Básico';
    detalle = 'Mejora a Pro para analítica, Bre-B y reportes.';
  }

  return (
    <div
      className="rounded-3xl p-5 shadow-sm"
      style={{ backgroundColor: `color-mix(in oklch, ${color} 12%, var(--card))` }}
    >
      <p className="font-semibold" style={{ color }}>
        {titulo}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}

function PlanCard({
  nombre,
  precio,
  features,
  destacado,
  activo,
  cta,
}: {
  nombre: string;
  precio: number;
  features: readonly string[];
  destacado?: boolean;
  activo?: boolean;
  cta?: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-3xl bg-card p-6 shadow-sm ${
        destacado ? 'ring-2 ring-[var(--utilidad)]/40' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{nombre}</h2>
        {destacado && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--utilidad)]/15 px-2.5 py-1 text-xs font-medium text-[var(--utilidad)]">
            <Sparkles className="h-3 w-3" /> Recomendado
          </span>
        )}
      </div>
      <p className="mt-2">
        <span className="text-3xl font-semibold tabular-nums">{formatCOP(precio)}</span>
        <span className="text-sm text-muted-foreground"> /mes</span>
      </p>

      <ul className="mt-5 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ingreso)]" />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {activo ? (
          <span className="flex h-11 w-full items-center justify-center rounded-2xl bg-secondary text-sm font-medium text-muted-foreground">
            Tu plan actual
          </span>
        ) : (
          cta ?? (
            <span className="flex h-11 w-full items-center justify-center rounded-2xl border border-border text-sm text-muted-foreground">
              Incluido en tu prueba
            </span>
          )
        )}
      </div>
    </section>
  );
}

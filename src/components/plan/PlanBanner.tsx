import Link from 'next/link';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { PlanInfo } from '@/lib/plan/queries';

export function PlanBanner({ plan }: { plan: PlanInfo }) {
  const esPago = plan.plan === 'basico' || plan.plan === 'pro';

  // Bloqueado: prueba vencida o plan de pago vencido.
  if (plan.bloqueado) {
    const mensaje = esPago
      ? 'Tu plan venció. Renuévalo para seguir vendiendo.'
      : 'Tu prueba terminó. Mejora tu plan para seguir vendiendo.';
    return (
      <Link
        href="/dashboard/plan"
        className="flex items-center gap-2 bg-[var(--egreso)] px-4 py-2 text-sm font-medium text-white"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{mensaje}</span>
        <span className="shrink-0 underline underline-offset-2">Ver planes</span>
      </Link>
    );
  }

  // Prueba por vencer (≤ 7 días).
  if (plan.trialActivo && plan.diasRestantes !== null && plan.diasRestantes <= 7) {
    return (
      <Link
        href="/dashboard/plan"
        className="flex items-center gap-2 bg-[var(--utilidad)]/15 px-4 py-2 text-sm font-medium text-[var(--utilidad)]"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Te quedan {plan.diasRestantes} día{plan.diasRestantes === 1 ? '' : 's'} de prueba gratis.
        </span>
        <span className="shrink-0 underline underline-offset-2">Ver planes</span>
      </Link>
    );
  }

  // Plan de pago por vencer (≤ 5 días) → recordar renovar.
  if (esPago && plan.diasRestantes !== null && plan.diasRestantes <= 5) {
    return (
      <Link
        href="/dashboard/plan"
        className="flex items-center gap-2 bg-[var(--utilidad)]/15 px-4 py-2 text-sm font-medium text-[var(--utilidad)]"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Tu plan vence en {plan.diasRestantes} día{plan.diasRestantes === 1 ? '' : 's'}. Renuévalo para no perder acceso.
        </span>
        <span className="shrink-0 underline underline-offset-2">Renovar</span>
      </Link>
    );
  }

  return null;
}

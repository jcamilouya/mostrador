import Link from 'next/link';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { PlanInfo } from '@/lib/plan/queries';

export function PlanBanner({ plan }: { plan: PlanInfo }) {
  // Bloqueado: trial vencido.
  if (plan.bloqueado) {
    return (
      <Link
        href="/dashboard/plan"
        className="flex items-center gap-2 bg-[var(--egreso)] px-4 py-2 text-sm font-medium text-white"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">Tu prueba terminó. Mejora tu plan para seguir vendiendo.</span>
        <span className="shrink-0 underline underline-offset-2">Ver planes</span>
      </Link>
    );
  }

  // Trial por vencer (≤ 7 días).
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

  return null;
}

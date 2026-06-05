import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

export function PlanUpsell({
  titulo = 'Esta es una función Pro',
  descripcion = 'Mejora tu plan para desbloquear esta sección y ver tu negocio en detalle.',
}: {
  titulo?: string;
  descripcion?: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--utilidad)]/15">
        <Lock className="h-7 w-7 text-[var(--utilidad)]" />
      </div>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
      <Link href="/dashboard/plan" className="mt-5 inline-block">
        <span className="inline-flex h-11 items-center gap-2 rounded-2xl bg-foreground px-5 text-sm font-medium text-background">
          <Sparkles className="h-4 w-4" /> Ver planes
        </span>
      </Link>
    </div>
  );
}

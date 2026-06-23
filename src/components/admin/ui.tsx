import type { EstadoSuscripcion } from '@/lib/admin/queries';

export const ESTADO_INFO: Record<
  EstadoSuscripcion,
  { label: string; color: string }
> = {
  pro: { label: 'Pro', color: 'var(--utilidad)' },
  basico: { label: 'Básico', color: 'var(--ingreso)' },
  trial_activo: { label: 'En prueba', color: 'var(--ingreso)' },
  trial_vencido: { label: 'Prueba vencida', color: 'var(--egreso)' },
};

export function EstadoBadge({
  estado,
  diasRestantes,
}: {
  estado: EstadoSuscripcion;
  diasRestantes?: number | null;
}) {
  const info = ESTADO_INFO[estado];
  const sufijo =
    estado === 'trial_activo' && diasRestantes != null ? ` · ${diasRestantes}d` : '';
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: info.color,
        backgroundColor: `color-mix(in oklch, ${info.color} 14%, transparent)`,
      }}
    >
      {info.label}
      {sufijo}
    </span>
  );
}

const FMT_FECHA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  return FMT_FECHA.format(new Date(iso));
}

export function haceCuanto(iso: string | null): string {
  if (!iso) return 'sin actividad';
  const ms = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  if (dias < 365) return `hace ${Math.floor(dias / 30)} meses`;
  return `hace ${Math.floor(dias / 365)} años`;
}

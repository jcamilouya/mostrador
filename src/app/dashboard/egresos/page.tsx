import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, TrendingDown, Receipt, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getEgresosPaginados, getEgresosStats, type RangoEgresos } from '@/lib/egresos/queries';
import { CATEGORIA_INFO } from '@/lib/egresos/schemas';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Gastos — Mostrador',
};

const RANGOS_VALIDOS: RangoEgresos[] = ['7d', '30d', 'mes'];

export default async function EgresosPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; page?: string }>;
}) {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const sp = await searchParams;
  const rango = RANGOS_VALIDOS.includes(sp.rango as RangoEgresos)
    ? (sp.rango as RangoEgresos)
    : '30d';
  const page = Math.max(1, Number(sp.page) || 1);

  const [pagina, stats] = await Promise.all([
    getEgresosPaginados(empresaId, { rango, page }),
    getEgresosStats(empresaId),
  ]);

  const topCat = stats.porCategoria[0];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Todo lo que sale del negocio. Para saber cuánto te queda de verdad.
          </p>
        </div>
        <Link href="/dashboard/egresos/nuevo">
          <Button size="lg" className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </Link>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Este mes"
          monto={formatCOP(stats.totalMes)}
          subtitulo={`${stats.cantMes} gasto${stats.cantMes === 1 ? '' : 's'}`}
          icon={TrendingDown}
          color="var(--egreso)"
          destacado
        />
        <Kpi
          label="Últimos 7 días"
          monto={formatCOP(stats.totalSemana)}
          subtitulo="semana"
          icon={Calendar}
          color="var(--utilidad)"
        />
        <Kpi
          label={topCat ? `Top: ${CATEGORIA_INFO[topCat.categoria].emoji} ${CATEGORIA_INFO[topCat.categoria].label}` : 'Sin gastos'}
          monto={topCat ? formatCOP(topCat.total) : '—'}
          subtitulo="categoría con más gasto"
          icon={Receipt}
          color={topCat ? CATEGORIA_INFO[topCat.categoria].color : 'var(--muted-foreground)'}
        />
      </section>

      <ExpenseList
        egresos={pagina.rows}
        rango={pagina.rango}
        page={pagina.page}
        totalPaginas={pagina.totalPaginas}
        totalRegistros={pagina.totalRegistros}
      />
    </div>
  );
}

function Kpi({
  label,
  monto,
  subtitulo,
  icon: Icon,
  color,
  destacado,
}: {
  label: string;
  monto: string;
  subtitulo: string;
  icon: typeof TrendingDown;
  color: string;
  destacado?: boolean;
}) {
  return (
    <div className={`rounded-2xl bg-card p-4 shadow-sm ${destacado ? 'ring-2 ring-[var(--egreso)]/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </span>
      </div>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums"
        style={destacado ? { color } : {}}
      >
        {monto}
      </p>
      <p className="text-xs text-muted-foreground">{subtitulo}</p>
    </div>
  );
}

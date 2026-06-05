import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendingUp, ShoppingCart } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getIngresos, type RangoIngresos } from '@/lib/ingresos/queries';
import { IngresosTabla } from '@/components/ingresos/IngresosTabla';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Ingresos — Mostrador',
};

const RANGOS_VALIDOS: RangoIngresos[] = ['7d', '30d', 'mes'];

export default async function IngresosPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; page?: string }>;
}) {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const sp = await searchParams;
  const rango = RANGOS_VALIDOS.includes(sp.rango as RangoIngresos)
    ? (sp.rango as RangoIngresos)
    : '30d';
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('id', empresaId)
    .maybeSingle();
  const negocio = empresa?.nombre ?? 'Mi negocio';

  const data = await getIngresos(empresaId, { rango, page });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Ingresos</h1>
          <p className="text-sm text-muted-foreground">
            Toca una venta para ver el detalle.
          </p>
        </div>
        <Link
          href="/dashboard/pos"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-medium text-background"
        >
          <ShoppingCart className="h-4 w-4" /> Vender
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Ingresos" valor={formatCOP(data.totalCompletado)} sub={`${data.countCompletado} ventas`} destacado />
        <Kpi label="Ticket promedio" valor={formatCOP(data.ticketPromedio)} sub="Por venta" />
        <Kpi label="Pendiente" valor={formatCOP(data.totalPendiente)} sub="Por confirmar" />
        <Kpi label="Transacciones" valor={String(data.totalRegistros)} sub="En el período" />
      </section>

      <section className="space-y-4">
        <header className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Movimientos</h2>
        </header>

        <IngresosTabla
          rows={data.rows}
          negocio={negocio}
          rango={data.rango}
          page={data.page}
          totalPaginas={data.totalPaginas}
          totalRegistros={data.totalRegistros}
        />
      </section>
    </div>
  );
}

function Kpi({
  label,
  valor,
  sub,
  destacado,
}: {
  label: string;
  valor: string;
  sub: string;
  destacado?: boolean;
}) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${destacado ? 'text-2xl text-[var(--ingreso)]' : 'text-xl'}`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

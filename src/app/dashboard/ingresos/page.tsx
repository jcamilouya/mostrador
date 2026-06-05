import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrendingUp, Clock, ShoppingCart, ArrowRight } from 'lucide-react';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getIngresos } from '@/lib/ingresos/queries';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Ingresos — Mostrador',
};

const METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export default async function IngresosPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const data = await getIngresos(empresaId, 30);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Ingresos</h1>
          <p className="text-sm text-muted-foreground">Tus ventas de los últimos {data.dias} días.</p>
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
        <Kpi label="Transacciones" valor={String(data.rows.length)} sub={`En ${data.dias} días`} />
      </section>

      <section className="rounded-3xl bg-card shadow-sm">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Movimientos</h2>
        </header>

        {data.rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no has registrado ventas. Empieza desde el POS.
            </p>
            <Link href="/dashboard/pos" className="mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline">
              Ir a vender <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y">
            {data.rows.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">Venta #{v.numero_venta}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(v.created_at).toLocaleString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>·</span>
                    <span>{v.items_count} items</span>
                    <span>·</span>
                    <span>{METODO[v.metodo_pago] ?? v.metodo_pago}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-[var(--ingreso)]">
                    + {formatCOP(v.total)}
                  </p>
                  {v.estado === 'pendiente' && (
                    <p className="text-xs text-[var(--utilidad)]">Pendiente</p>
                  )}
                  {v.estado === 'cancelada' && (
                    <p className="text-xs text-[var(--egreso)]">Cancelada</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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

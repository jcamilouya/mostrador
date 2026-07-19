import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  TrendingUp,
  Receipt,
  Wallet,
  ShoppingCart,
  Clock,
  AlertTriangle,
  ArrowRight,
  Carrot,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getDashboardStats } from '@/lib/dashboard/queries';
import { contarInsumosBajos } from '@/lib/insumos/queries';
import { getBalanceDiario } from '@/lib/analitica/queries';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { WelcomeGuide } from '@/components/dashboard/WelcomeGuide';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Inicio — Mostrador',
};

const METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export default async function DashboardHome() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [stats, balance, insumosBajos] = await Promise.all([
    getDashboardStats(empresaId),
    getBalanceDiario(empresaId, 30),
    contarInsumosBajos(empresaId),
  ]);

  const nombre =
    (user?.user_metadata?.nombre as string | undefined) ??
    user?.email?.split('@')[0] ??
    'tendero';

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <WelcomeGuide />

      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{saludo},</p>
        <h1 className="text-3xl font-semibold tracking-tight">{nombre} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {stats.ventasHoyCount === 0
            ? 'Aún no has vendido nada hoy. ¡El primer cliente está por llegar!'
            : 'Esto es lo que pasó hoy en tu negocio.'}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ventas de hoy"
          monto={formatCOP(stats.ventasHoyTotal)}
          subtitulo={`${stats.ventasHoyCount} ${stats.ventasHoyCount === 1 ? 'transacción' : 'transacciones'}`}
          icon={ShoppingCart}
          color="var(--ingreso)"
        />
        <Kpi
          label="Gastos de hoy"
          monto={formatCOP(stats.egresosHoyTotal)}
          subtitulo={`${stats.egresosHoyCount} ${stats.egresosHoyCount === 1 ? 'movimiento' : 'movimientos'}`}
          icon={Receipt}
          color="var(--egreso)"
        />
        <Kpi
          label="Lo que ganaste"
          monto={formatCOP(stats.utilidadHoy)}
          subtitulo="Ventas − Gastos"
          icon={Wallet}
          color="var(--utilidad)"
          destacado
        />
        <Kpi
          label="Ticket promedio"
          monto={formatCOP(stats.ticketPromedio)}
          subtitulo="Por venta"
          icon={TrendingUp}
          color="var(--utilidad)"
        />
      </section>

      <RevenueChart serie={balance} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-card p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Últimas ventas</h2>
            <Link
              href="/dashboard/pos"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Ir al POS <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          {stats.ultimasVentas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Cuando registres una venta, va a aparecer aquí.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.ultimasVentas.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">Venta #{v.numero_venta}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(v.created_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      <span>·</span>
                      {METODO[v.metodo_pago] ?? v.metodo_pago}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-[var(--ingreso)]">
                    + {formatCOP(v.total)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl bg-card p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Inventario</h2>
            <Link
              href="/dashboard/inventario"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Ver productos <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          {stats.productosStockBajo === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Todo tu inventario tiene buen stock. 👌
            </p>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-[var(--utilidad)]/10 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--utilidad)]/20">
                <AlertTriangle className="h-5 w-5 text-[var(--utilidad)]" />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-[var(--utilidad)]">
                  {stats.productosStockBajo}{' '}
                  producto{stats.productosStockBajo === 1 ? '' : 's'} con stock bajo
                </p>
                <p className="text-xs text-muted-foreground">
                  Repón pronto para no quedarte sin vender.
                </p>
              </div>
            </div>
          )}

          {insumosBajos > 0 && (
            <Link
              href="/dashboard/insumos"
              className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--egreso)]/10 p-4 transition-colors hover:bg-[var(--egreso)]/15"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--egreso)]/20">
                <Carrot className="h-5 w-5 text-[var(--egreso)]" />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-[var(--egreso)]">
                  {insumosBajos} ingrediente{insumosBajos === 1 ? '' : 's'} por agotarse
                </p>
                <p className="text-xs text-muted-foreground">Toca para reponer.</p>
              </div>
            </Link>
          )}
        </div>
      </section>
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
  icon: typeof TrendingUp;
  color: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl bg-card p-5 shadow-sm transition-transform hover:scale-[1.01] ${
        destacado ? 'ring-2 ring-[var(--utilidad)]/30' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </span>
      </div>
      <p
        className={`font-semibold tabular-nums ${destacado ? 'text-3xl' : 'text-2xl'}`}
        style={destacado ? { color } : {}}
      >
        {monto}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p>
    </div>
  );
}

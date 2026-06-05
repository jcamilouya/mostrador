import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Coins,
  PackageX,
  CreditCard,
} from 'lucide-react';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import {
  getAnaliticaData,
  type CeldaHora,
  type ComparativoMes,
  type FilaProducto,
  type ProductoSinMovimiento,
} from '@/lib/analitica/queries';
import { MetodosPagoChart } from '@/components/analitica/MetodosPagoChart';
import { PlanUpsell } from '@/components/plan/PlanUpsell';
import { getPlanInfo } from '@/lib/plan/queries';
import { formatCOP, formatNumber } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Analítica — Mostrador',
};

const DIAS = 30;

export default async function AnaliticaPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const plan = await getPlanInfo(empresaId);

  if (!plan.esPro) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Analítica</h1>
          <p className="text-sm text-muted-foreground">
            Entiende tu negocio: horas pico, productos estrella y márgenes.
          </p>
        </header>
        <PlanUpsell
          titulo="La analítica avanzada es Pro"
          descripcion="Descubre a qué horas vendes más, qué productos dejan más plata y compara mes a mes. Mejora a Pro para verlo."
        />
      </div>
    );
  }

  const data = await getAnaliticaData(empresaId, DIAS);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Analítica</h1>
        <p className="text-sm text-muted-foreground">
          Lo que pasó en tu negocio en los últimos {DIAS} días.
        </p>
      </header>

      <Comparativo actual={data.mesActual} anterior={data.mesAnterior} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card titulo="Métodos de pago" icon={CreditCard}>
          <MetodosPagoChart data={data.metodosPago} total={data.totalVentasPeriodo} />
        </Card>
        <Card titulo="Top productos" icon={Trophy}>
          <TopProductos filas={data.topProductos} />
        </Card>
      </div>

      <Card titulo="Horas pico" icon={Clock}>
        <HorasPico celdas={data.horas} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card titulo="Margen por producto" icon={Coins}>
          <MargenProductos filas={data.margenProductos} />
        </Card>
        <Card titulo="Sin movimiento" icon={PackageX}>
          <SinMovimiento productos={data.sinMovimiento} />
        </Card>
      </div>
    </div>
  );
}

function Card({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{titulo}</h2>
      </header>
      {children}
    </section>
  );
}

/* ---------- Comparativo mes vs mes ---------- */

function Comparativo({
  actual,
  anterior,
}: {
  actual: ComparativoMes;
  anterior: ComparativoMes;
}) {
  const items = [
    { label: 'Ingresos del mes', valor: actual.ingresos, prev: anterior.ingresos, color: 'var(--ingreso)' },
    { label: 'Gastos del mes', valor: actual.egresos, prev: anterior.egresos, color: 'var(--egreso)', invertir: true },
    { label: 'Utilidad del mes', valor: actual.utilidad, prev: anterior.utilidad, color: 'var(--utilidad)' },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-3xl bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {it.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: it.color }}>
            {formatCOP(it.valor)}
          </p>
          <Delta actual={it.valor} anterior={it.prev} invertir={it.invertir} />
        </div>
      ))}
    </section>
  );
}

function Delta({
  actual,
  anterior,
  invertir,
}: {
  actual: number;
  anterior: number;
  invertir?: boolean;
}) {
  // No mostrar comparativo engañoso: en los primeros días del mes, o cuando
  // alguno de los dos períodos no tiene datos, un porcentaje no significa nada.
  const diasDelMes = new Date().getDate();
  if (diasDelMes <= 5 || anterior === 0 || actual === 0) {
    return (
      <span className="mt-1 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
        Primer período
      </span>
    );
  }
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100;
  const subio = pct > 0;
  const plano = Math.abs(pct) < 0.5;
  // Para gastos, subir es "malo": invertimos el color.
  const bueno = plano ? null : invertir ? !subio : subio;
  const Icon = plano ? Minus : subio ? TrendingUp : TrendingDown;
  const color = bueno === null ? 'var(--muted-foreground)' : bueno ? 'var(--ingreso)' : 'var(--egreso)';

  return (
    <p className="mt-1 flex items-center gap-1 text-xs" style={{ color }}>
      <Icon className="h-3 w-3" />
      {plano ? 'Igual que' : `${subio ? '+' : ''}${pct.toFixed(0)}% vs`} mes pasado
    </p>
  );
}

/* ---------- Top productos ---------- */

function TopProductos({ filas }: { filas: FilaProducto[] }) {
  if (filas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay ventas registradas.</p>;
  }
  const max = Math.max(...filas.map((f) => f.unidades), 1);
  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.producto_id ?? f.nombre} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="truncate font-medium">{f.nombre}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatNumber(f.unidades)} u · {formatCOP(f.ingreso)}
            </span>
          </div>
          <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[var(--ingreso)]"
              style={{ width: `${(f.unidades / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Margen por producto ---------- */

function MargenProductos({ filas }: { filas: FilaProducto[] }) {
  if (filas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay ventas registradas.</p>;
  }
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li
          key={f.producto_id ?? f.nombre}
          className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{f.nombre}</span>
            <span className="text-xs text-muted-foreground">
              {f.margenPct.toFixed(0)}% de margen
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--utilidad)]">
            {formatCOP(f.margen)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Sin movimiento ---------- */

function SinMovimiento({ productos }: { productos: ProductoSinMovimiento[] }) {
  if (productos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todos tus productos se han vendido en los últimos {DIAS} días. 🎉
      </p>
    );
  }
  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        {productos.length} producto{productos.length === 1 ? '' : 's'} sin vender en {DIAS} días.
        Considera una promoción o liquidación.
      </p>
      <ul className="space-y-2">
        {productos.slice(0, 10).map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm"
          >
            <span className="truncate font-medium">{p.nombre}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatNumber(p.stock_actual)} en stock · {formatCOP(p.precio_venta)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- Horas pico (heatmap) ---------- */

const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];
const DIAS_LABEL: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
};
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function HorasPico({ celdas }: { celdas: CeldaHora[] }) {
  if (celdas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Cuando tengas más ventas vas a ver a qué horas vende más tu negocio.
      </p>
    );
  }

  const mapa = new Map<string, CeldaHora>();
  let max = 0;
  for (const c of celdas) {
    mapa.set(`${c.dia_semana}-${c.hora}`, c);
    if (c.ventas > max) max = c.ventas;
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
      <div className="min-w-[640px]">
        <div className="mb-1 grid grid-cols-[2.5rem_repeat(24,1fr)] gap-0.5">
          <span />
          {HORAS.map((h) => (
            <span key={h} className="text-center text-[9px] text-muted-foreground">
              {h % 3 === 0 ? h : ''}
            </span>
          ))}
        </div>
        {DIAS_ORDEN.map((d) => (
          <div key={d} className="mb-0.5 grid grid-cols-[2.5rem_repeat(24,1fr)] items-center gap-0.5">
            <span className="text-[11px] text-muted-foreground">{DIAS_LABEL[d]}</span>
            {HORAS.map((h) => {
              const c = mapa.get(`${d}-${h}`);
              const intensidad = c && max > 0 ? c.ventas / max : 0;
              return (
                <div
                  key={h}
                  className="aspect-square rounded-[3px]"
                  title={
                    c
                      ? `${DIAS_LABEL[d]} ${h}:00 — ${c.ventas} venta${c.ventas === 1 ? '' : 's'} · ${formatCOP(c.monto)}`
                      : `${DIAS_LABEL[d]} ${h}:00 — sin ventas`
                  }
                  style={{
                    backgroundColor:
                      intensidad === 0
                        ? 'var(--secondary)'
                        : `color-mix(in oklch, var(--ingreso) ${Math.round(15 + intensidad * 85)}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

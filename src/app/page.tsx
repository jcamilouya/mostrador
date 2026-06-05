import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles, Store, ArrowRight, MessageCircle, QrCode, TrendingUp, Check, X } from 'lucide-react';
import { PRECIOS, FEATURES } from '@/lib/plan/queries';
import { formatCOP } from '@/lib/utils/format';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="rounded-xl bg-card p-2 shadow-sm">
              <Store className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">Mostrador</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Entrar
            </Link>
            <Link href="/register">
              <Button className="rounded-2xl text-sm sm:text-base">Empezar</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-medium text-secondary-foreground sm:text-sm">
            <Sparkles className="h-4 w-4 text-[var(--utilidad)]" />
            Para dueños de negocio en Colombia
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Mostrador
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Las otras apps te dicen cuánto vendiste. Nosotros te decimos cuánto{' '}
            <span className="text-[var(--utilidad)] font-semibold">ganaste</span>.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Feature
              icon={QrCode}
              titulo="Cobra con Bre-B"
              texto="QR de cualquier banco, $0 comisión."
              color="var(--ingreso)"
            />
            <Feature
              icon={MessageCircle}
              titulo="Gastos por WhatsApp"
              texto="Tómale foto a la factura, la IA hace el resto."
              color="var(--egreso)"
            />
            <Feature
              icon={TrendingUp}
              titulo="Sabes cuánto ganas"
              texto="Balance real automático, sin contadores."
              color="var(--utilidad)"
            />
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Link href="/register">
              <Button size="lg" className="rounded-2xl gap-2 px-6">
                Crear mi negocio gratis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              30 días gratis. Sin tarjeta. Sin compromisos.
            </p>
          </div>
        </div>
      </section>

      {/* Comparativa */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Lo que otras apps no te dan
          </h2>
          <div className="mt-6 overflow-hidden rounded-3xl bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Función</th>
                  <th className="px-3 py-3 text-center font-medium">Mostrador</th>
                  <th className="px-3 py-3 text-center font-medium">Otras</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  'POS + inventario + contabilidad real',
                  'Cobros Bre-B sin comisión',
                  'Gastos por foto con IA en WhatsApp',
                  'Te dice cuánto ganaste, no solo cuánto vendiste',
                  'Transacciones ilimitadas',
                ].map((f) => (
                  <tr key={f}>
                    <td className="px-4 py-3">{f}</td>
                    <td className="px-3 py-3 text-center">
                      <Check className="mx-auto h-4 w-4 text-[var(--ingreso)]" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <X className="mx-auto h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Precios */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Precios claros, sin letra chiquita
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Empieza con 30 días gratis. Cancela cuando quieras.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PlanCard nombre="Básico" precio={PRECIOS.basico} features={FEATURES.basico} />
            <PlanCard nombre="Pro" precio={PRECIOS.pro} features={FEATURES.pro} destacado />
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl bg-foreground px-6 py-10 text-center text-background">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Deja de adivinar cuánto ganas
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-background/70">
            Únete a los negocios que ya llevan sus cuentas claras desde el celular.
          </p>
          <Link href="/register" className="mt-6 inline-block">
            <span className="inline-flex h-12 items-center gap-2 rounded-2xl bg-background px-6 text-sm font-medium text-foreground">
              Crear mi negocio gratis <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </section>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        Mostrador · Hecho en Colombia para negocios de barrio.
      </footer>
    </main>
  );
}

function PlanCard({
  nombre,
  precio,
  features,
  destacado,
}: {
  nombre: string;
  precio: number;
  features: readonly string[];
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-3xl bg-card p-6 text-left shadow-sm ${
        destacado ? 'ring-2 ring-[var(--utilidad)]/40' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{nombre}</h3>
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
      <Link href="/register" className="mt-6">
        <Button
          className="w-full rounded-2xl"
          variant={destacado ? 'default' : 'outline'}
        >
          Empezar gratis
        </Button>
      </Link>
    </div>
  );
}

function Feature({
  icon: Icon,
  titulo,
  texto,
  color,
}: {
  icon: typeof QrCode;
  titulo: string;
  texto: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 text-left shadow-sm">
      <span
        className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </span>
      <p className="font-medium text-sm">{titulo}</p>
      <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}

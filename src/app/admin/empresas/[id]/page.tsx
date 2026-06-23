import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  CalendarPlus,
  ShoppingCart,
  Package,
  Users,
  Receipt,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  QrCode,
  Clock,
  History,
} from 'lucide-react';
import { getEmpresaResumen, getAdminLog, getUltimoLogin } from '@/lib/admin/queries';
import { activarPro, extenderDias } from '@/lib/admin/actions';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import { EstadoBadge, fechaCorta, haceCuanto } from '@/components/admin/ui';
import { SuscripcionForm } from '@/components/admin/SuscripcionForm';
import { NotasForm } from '@/components/admin/NotasForm';

export const metadata: Metadata = { title: 'Empresa — Panel Admin' };

const ACCION_LABEL: Record<string, string> = {
  cambiar_plan: 'Cambió el plan',
  extender: 'Extendió la suscripción',
  activar_pro: 'Activó Pro',
  notas: 'Editó notas internas',
};

export default async function AdminEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const empresa = await getEmpresaResumen(id);
  if (!empresa) notFound();

  const [logs, ultimoLogin] = await Promise.all([
    getAdminLog(id),
    getUltimoLogin(empresa.usuarioId),
  ]);

  const utilidad = empresa.ventasMonto - empresa.egresosMonto;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/empresas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Empresas
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{empresa.nombre}</h1>
        <EstadoBadge estado={empresa.estado} diasRestantes={empresa.diasRestantes} />
        {!empresa.activa && empresa.ventasCount === 0 && (
          <span className="rounded-full bg-[var(--egreso)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--egreso)]">
            Sin actividad
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-4 lg:col-span-2">
          {/* Suscripción */}
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Suscripción</h2>
            <SuscripcionForm empresaId={empresa.id} plan={empresa.plan} expiraEn={empresa.planExpiraEn} />

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <form action={activarPro.bind(null, empresa.id)}>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--utilidad)]/15 px-3 text-sm font-medium text-[var(--utilidad)] hover:opacity-80">
                  <Sparkles className="h-4 w-4" /> Activar Pro (1 mes)
                </button>
              </form>
              <form action={extenderDias.bind(null, empresa.id, 30)}>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-secondary">
                  <CalendarPlus className="h-4 w-4" /> +30 días
                </button>
              </form>
              <form action={extenderDias.bind(null, empresa.id, 7)}>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-secondary">
                  <CalendarPlus className="h-4 w-4" /> +7 días
                </button>
              </form>
            </div>
          </section>

          {/* Uso */}
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Uso</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric icon={<ShoppingCart className="h-4 w-4" />} label="Ventas" valor={formatNumber(empresa.ventasCount)} sub={formatCOP(empresa.ventasMonto)} />
              <Metric icon={<Receipt className="h-4 w-4" />} label="Egresos" valor={formatNumber(empresa.egresosCount)} sub={formatCOP(empresa.egresosMonto)} />
              <Metric icon={<Package className="h-4 w-4" />} label="Productos" valor={formatNumber(empresa.productosCount)} />
              <Metric icon={<Users className="h-4 w-4" />} label="Clientes" valor={formatNumber(empresa.clientesCount)} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
              <Dato label="Utilidad (histórica)" valor={formatCOP(utilidad)} />
              <Dato label="Primera venta" valor={fechaCorta(empresa.primeraVenta)} />
              <Dato label="Última venta" valor={haceCuanto(empresa.ultimaVenta)} />
            </div>
          </section>

          {/* Notas */}
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Notas internas</h2>
            <NotasForm empresaId={empresa.id} notas={empresa.notasInternas} />
          </section>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Datos */}
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Datos</h2>
            <dl className="space-y-2.5 text-sm">
              <Fila icon={<Mail className="h-4 w-4" />} label="Dueño" valor={empresa.usuarioEmail ?? empresa.email} extra={empresa.usuarioNombre} />
              <Fila icon={<Phone className="h-4 w-4" />} label="Teléfono" valor={empresa.telefono ?? '—'} />
              <Fila icon={<Receipt className="h-4 w-4" />} label="NIT" valor={empresa.nit ?? '—'} />
              <Fila icon={<MapPin className="h-4 w-4" />} label="Dirección" valor={empresa.direccion ?? '—'} />
              <Fila icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" valor={empresa.whatsappNumero ?? 'no configurado'} />
              <Fila icon={<QrCode className="h-4 w-4" />} label="Bre-B" valor={empresa.brebConfigurado ? (empresa.brebBanco ?? 'configurado') : 'no configurado'} />
              <Fila icon={<CalendarPlus className="h-4 w-4" />} label="Registrada" valor={fechaCorta(empresa.createdAt)} />
              <Fila icon={<Clock className="h-4 w-4" />} label="Último ingreso" valor={ultimoLogin ? haceCuanto(ultimoLogin) : '—'} />
            </dl>
          </section>

          {/* Auditoría */}
          <section className="rounded-3xl bg-card p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 font-semibold">
              <History className="h-4 w-4" /> Historial de cambios
            </h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <ul className="space-y-3">
                {logs.map((l) => (
                  <li key={l.id} className="text-sm">
                    <p className="font-medium">{ACCION_LABEL[l.accion] ?? l.accion}</p>
                    <p className="text-xs text-muted-foreground">
                      {fechaCorta(l.createdAt)} · {l.adminEmail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  valor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{valor}</p>
    </div>
  );
}

function Fila({
  icon,
  label,
  valor,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  extra?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate font-medium">{valor}</dd>
        {extra && <dd className="truncate text-xs text-muted-foreground">{extra}</dd>}
      </div>
    </div>
  );
}

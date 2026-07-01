import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getEmpresasResumen, type EmpresaResumen } from '@/lib/admin/queries';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import { EstadoBadge, fechaCorta, haceCuanto } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Empresas — Panel Admin' };

type SP = { q?: string; estado?: string };

const ESTADO_OPCIONES = [
  { value: '', label: 'Todos los estados' },
  { value: 'trial_activo', label: 'En prueba' },
  { value: 'trial_vencido', label: 'Prueba vencida' },
  { value: 'pro', label: 'Pro' },
  { value: 'pro_vencido', label: 'Pro vencido' },
  { value: 'basico', label: 'Básico' },
  { value: 'basico_vencido', label: 'Básico vencido' },
  { value: 'activas', label: 'Activas (30d)' },
  { value: 'zombies', label: 'Sin actividad' },
];

function filtrar(empresas: EmpresaResumen[], { q, estado }: SP): EmpresaResumen[] {
  let out = empresas;
  const term = (q ?? '').trim().toLowerCase();
  if (term) {
    out = out.filter((e) =>
      [e.nombre, e.email, e.usuarioEmail, e.nit, e.telefono]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term)),
    );
  }
  if (estado) {
    if (estado === 'activas') out = out.filter((e) => e.activa);
    else if (estado === 'zombies') out = out.filter((e) => e.ventasCount === 0);
    else out = out.filter((e) => e.estado === estado);
  }
  return out;
}

export default async function AdminEmpresasPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const todas = await getEmpresasResumen();
  const empresas = filtrar(todas, sp);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(empresas.length)} de {formatNumber(todas.length)}
          </p>
        </div>
      </header>

      {/* Filtros (GET, sin JS) */}
      <form className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Buscar negocio, correo, NIT, teléfono…"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          name="estado"
          defaultValue={sp.estado ?? ''}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {ESTADO_OPCIONES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-xl bg-foreground px-4 text-sm font-medium text-background"
        >
          Filtrar
        </button>
      </form>

      {empresas.length === 0 ? (
        <div className="rounded-3xl bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          No hay empresas que coincidan.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Negocio</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Ventas</th>
                <th className="px-4 py-3 text-right font-medium">Productos</th>
                <th className="px-4 py-3 font-medium">Registrada</th>
                <th className="px-4 py-3 font-medium">Actividad</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/empresas/${e.id}`} className="block">
                      <p className="font-medium">{e.nombre}</p>
                      <p className="text-xs text-muted-foreground">{e.usuarioEmail ?? e.email}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={e.estado} diasRestantes={e.diasRestantes} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <p className="font-medium">{formatCOP(e.ventasMonto)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(e.ventasCount)} ventas</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(e.productosCount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fechaCorta(e.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{haceCuanto(e.ultimaVenta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

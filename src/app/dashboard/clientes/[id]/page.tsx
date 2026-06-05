import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getCliente, getVentasCliente } from '@/lib/clientes/queries';
import { actualizarCliente } from '@/lib/clientes/actions';
import { ClienteForm } from '@/components/clientes/ClienteForm';
import { DeleteClienteButton } from '@/components/clientes/DeleteClienteButton';
import { formatCOP } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Cliente — Mostrador',
};

const METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const { id } = await params;
  const cliente = await getCliente(empresaId, id);
  if (!cliente) notFound();

  const ventas = await getVentasCliente(empresaId, id);
  const bound = actualizarCliente.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{cliente.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {cliente.cantidad_compras > 0
              ? `${cliente.cantidad_compras} compra${cliente.cantidad_compras === 1 ? '' : 's'} · ${formatCOP(cliente.total_compras)} en total`
              : 'Sin compras registradas todavía'}
          </p>
        </div>
        <DeleteClienteButton id={id} />
      </header>

      <ClienteForm action={bound} cliente={cliente} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Historial de compras</h2>
        {ventas.length === 0 ? (
          <p className="rounded-3xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
            Este cliente aún no tiene compras asociadas.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-3xl bg-card shadow-sm">
            {ventas.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">Venta #{v.numero_venta}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(v.created_at).toLocaleDateString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span>·</span>
                    <span>{METODO[v.metodo_pago] ?? v.metodo_pago}</span>
                  </p>
                </div>
                <p
                  className={`shrink-0 font-semibold tabular-nums ${
                    v.estado === 'cancelada'
                      ? 'text-muted-foreground line-through'
                      : 'text-[var(--ingreso)]'
                  }`}
                >
                  {formatCOP(v.total)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

export const metadata = { title: 'Pago — Mostrador' };

/**
 * Página a la que vuelve el cliente después del Widget de Wompi.
 * OJO: aquí NO se activa el plan — eso lo hace el webhook al confirmar el banco.
 * Esta página solo informa.
 */
export default async function WompiReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const vista =
    status === 'success'
      ? {
          icon: <CheckCircle2 className="h-12 w-12 text-[var(--ingreso)]" />,
          titulo: '¡Pago recibido! 🎉',
          detalle:
            'Estamos activando tu plan. Puede tardar unos segundos en reflejarse. Refresca la página de tu plan en un momento.',
        }
      : status === 'pending'
        ? {
            icon: <Clock className="h-12 w-12 text-[var(--utilidad)]" />,
            titulo: 'Tu pago quedó pendiente',
            detalle:
              'Algunos métodos (PSE, Efecty) tardan en confirmarse. Apenas el banco lo apruebe, activamos tu plan automáticamente.',
          }
        : {
            icon: <XCircle className="h-12 w-12 text-[var(--egreso)]" />,
            titulo: 'El pago no se completó',
            detalle: 'No se realizó ningún cobro. Puedes intentarlo de nuevo cuando quieras.',
          };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {vista.icon}
      <h1 className="text-2xl font-semibold">{vista.titulo}</h1>
      <p className="text-sm text-muted-foreground">{vista.detalle}</p>
      <Link
        href="/dashboard/plan"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-6 text-sm font-medium text-background"
      >
        Ver mi plan
      </Link>
    </div>
  );
}

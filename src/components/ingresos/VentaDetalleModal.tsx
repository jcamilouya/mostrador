'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Ban, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCOP } from '@/lib/utils/format';
import { abrirWhatsAppRecibo } from '@/lib/recibo';
import {
  getVentaDetalle,
  anularVenta,
  type VentaDetalle,
} from '@/lib/ingresos/actions';

const METODO: Record<string, string> = {
  efectivo: '💵 Efectivo',
  breb: '⚡ Bre-B',
  transferencia: '💳 Transferencia',
  mixto: '💳 Mixto',
};

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VentaDetalleModal({
  ventaId,
  negocio,
  open,
  onClose,
}: {
  ventaId: string | null;
  negocio: string;
  open: boolean;
  onClose: () => void;
}) {
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [anulando, startAnular] = useTransition();

  useEffect(() => {
    if (!open || !ventaId) return;
    setVenta(null);
    setCargando(true);
    getVentaDetalle(ventaId)
      .then((d) => setVenta(d))
      .finally(() => setCargando(false));
  }, [ventaId, open]);

  function handleAnular() {
    if (!venta) return;
    const ok = window.confirm(
      `¿Anular la venta #${venta.numero_venta}? El stock de los productos se restaurará automáticamente.`,
    );
    if (!ok) return;
    startAnular(async () => {
      const res = await anularVenta(venta.id);
      if (res.ok) {
        toast.success('Venta anulada', {
          description: 'El stock fue restaurado automáticamente.',
        });
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRecibo() {
    if (!venta) return;
    abrirWhatsAppRecibo({
      negocio,
      created_at: venta.created_at,
      metodo_pago: venta.metodo_pago,
      total: venta.total,
      items: venta.items,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {venta ? `Venta #${venta.numero_venta}` : 'Detalle de venta'}
          </DialogTitle>
        </DialogHeader>

        {cargando && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!cargando && !venta && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pudimos cargar el detalle de esta venta.
          </p>
        )}

        {!cargando && venta && (
          <div className="space-y-4">
            {venta.estado === 'cancelada' && (
              <p className="rounded-xl bg-[var(--egreso)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--egreso)]">
                Esta venta está anulada
              </p>
            )}

            {/* Productos */}
            <div className="space-y-1">
              {venta.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between border-b py-2 text-sm last:border-b-0"
                >
                  <span className="min-w-0 truncate">
                    {item.nombre_producto} × {item.cantidad}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCOP(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCOP(venta.subtotal)}</span>
              </div>
              {venta.iva > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA</span>
                  <span className="tabular-nums">{formatCOP(venta.iva)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCOP(venta.total)}</span>
              </div>
            </div>

            {/* Método + fecha */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{METODO[venta.metodo_pago] ?? venta.metodo_pago}</span>
              <span>{formatFecha(venta.created_at)}</span>
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              {venta.estado !== 'cancelada' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={handleAnular}
                  disabled={anulando}
                >
                  {anulando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  Anular
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1"
                onClick={handleRecibo}
              >
                <Send className="h-4 w-4" /> Recibo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

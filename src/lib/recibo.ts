import { formatCOP } from '@/lib/utils/format';

export type ReciboItem = {
  nombre_producto: string;
  cantidad: number;
  subtotal: number;
};

export type ReciboData = {
  negocio: string;
  created_at: string;
  metodo_pago: string;
  total: number;
  items: ReciboItem[];
};

const METODO_LABEL: Record<string, string> = {
  efectivo: '💵 Efectivo',
  breb: '⚡ Bre-B',
  transferencia: '💳 Transferencia',
  mixto: '💳 Mixto',
};

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Texto del recibo que se prellenará en WhatsApp. */
export function generarTextoRecibo(venta: ReciboData): string {
  const items = venta.items
    .map((i) => `- ${i.nombre_producto} x${i.cantidad}: ${formatCOP(i.subtotal)}`)
    .join('\n');

  const metodo = METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago;

  return (
    `📄 *Recibo de compra*\n` +
    `📍 ${venta.negocio}\n` +
    `📅 ${formatFecha(venta.created_at)}\n\n` +
    `${items}\n\n` +
    `--------------------\n` +
    `*Total: ${formatCOP(venta.total)}*\n` +
    `${metodo}\n\n` +
    `_Gracias por tu compra_ 🙏`
  );
}

/**
 * Abre WhatsApp en el celular del dueño con el recibo prellenado.
 * Usa wa.me — no requiere API de Meta, tokens ni configuración.
 * Si no hay teléfono, abre WhatsApp sin destinatario (el dueño elige a quién).
 */
export function abrirWhatsAppRecibo(venta: ReciboData, telefono?: string): void {
  const texto = encodeURIComponent(generarTextoRecibo(venta));
  const numero = (telefono ?? '').replace(/\D/g, '');
  const url = numero
    ? `https://wa.me/${numero.startsWith('57') ? numero : `57${numero}`}?text=${texto}`
    : `https://wa.me/?text=${texto}`;
  window.open(url, '_blank');
}

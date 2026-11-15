/**
 * Tickets de 80 mm (comandas y cuentas) y cómo se imprimen. Solo navegador.
 *
 * Se imprime con el diálogo del navegador, así sirve CUALQUIER impresora que
 * el computador ya tenga instalada (USB, red o Bluetooth), sin drivers ni
 * programas extra. Para que salga sin preguntar, Chrome se abre con
 * `--kiosk-printing` y la térmica como impresora predeterminada.
 */

export type ComandaTicket = {
  numero: number;
  tipo: 'pedido' | 'anulado';
  titulo: string;
  detalle: string | null;
  items: { cantidad: number; nombre: string; nota: string | null }[];
  creado_por: string | null;
  created_at: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

const ESTILO = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm 4mm 8mm; width: 80mm; color: #000;
         font-family: ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace; font-size: 13px; line-height: 1.35; }
  .c { text-align: center; }
  .grande { font-size: 20px; font-weight: 700; }
  .medio { font-size: 15px; font-weight: 700; }
  .linea { border-top: 1px dashed #000; margin: 6px 0; }
  .fila { display: flex; justify-content: space-between; gap: 8px; }
  .item { font-size: 16px; font-weight: 700; margin: 4px 0 0; }
  .nota { font-size: 14px; margin: 0 0 2px 22px; }
  .anulado { font-size: 22px; font-weight: 800; letter-spacing: 2px; border: 2px solid #000; padding: 2px 0; margin: 4px 0; }
  .peq { font-size: 11px; }
`;

function documento(cuerpo: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>${ESTILO}</style></head><body>${cuerpo}</body></html>`;
}

export function ticketComanda(c: ComandaTicket): string {
  const items = c.items
    .map(
      (i) =>
        `<p class="item">${i.cantidad} × ${esc(i.nombre)}</p>${
          i.nota ? `<p class="nota">→ ${esc(i.nota)}</p>` : ''
        }`,
    )
    .join('');
  return documento(`
    <div class="c peq">COMANDA #${c.numero}</div>
    ${c.tipo === 'anulado' ? '<div class="c anulado">ANULADO</div>' : ''}
    <div class="c grande">${esc(c.titulo)}</div>
    ${c.detalle ? `<div class="c">${esc(c.detalle)}</div>` : ''}
    <div class="fila peq"><span>${hora(c.created_at)}</span><span>${esc(c.creado_por ?? '')}</span></div>
    <div class="linea"></div>
    ${items}
    <div class="linea"></div>
  `);
}

export type CuentaTicket = {
  negocio: string;
  titulo: string;
  detalle?: string | null;
  items: { cantidad: number; nombre: string; subtotal: number }[];
  total: number;
};

const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** La cuenta para llevarle a la mesa (o al domiciliario) antes de cobrar. */
export function ticketCuenta(c: CuentaTicket): string {
  const filas = c.items
    .map((i) => `<div class="fila"><span>${i.cantidad} ${esc(i.nombre)}</span><span>${cop(i.subtotal)}</span></div>`)
    .join('');
  return documento(`
    <div class="c medio">${esc(c.negocio)}</div>
    <div class="c">${esc(c.titulo)}</div>
    ${c.detalle ? `<div class="c peq">${esc(c.detalle)}</div>` : ''}
    <div class="c peq">${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</div>
    <div class="linea"></div>
    ${filas}
    <div class="linea"></div>
    <div class="fila grande"><span>TOTAL</span><span>${cop(c.total)}</span></div>
    <div class="linea"></div>
    <div class="c peq">Cuenta para revisar · no es factura</div>
  `);
}

/**
 * Imprime un documento sin salir de la pantalla: un iframe invisible con el
 * ticket y `print()`. Devuelve false si el navegador no lo permite.
 */
export function imprimirHTML(html: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    if (!doc || !f.contentWindow) {
      f.remove();
      return false;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        f.contentWindow?.focus();
        f.contentWindow?.print();
      } finally {
        setTimeout(() => f.remove(), 2000);
      }
    }, 60);
    return true;
  } catch {
    return false;
  }
}

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import type { ReporteData, TipoReporte } from './queries';

const METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  breb: 'Bre-B',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

const CATEGORIA: Record<string, string> = {
  proveedores: 'Proveedores',
  arriendo: 'Arriendo',
  servicios: 'Servicios',
  nomina: 'Nómina',
  impuestos: 'Impuestos',
  transporte: 'Transporte',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

const cop = (n: number) =>
  '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });

const TITULO: Record<TipoReporte, string> = {
  ventas: 'Reporte de ventas',
  egresos: 'Reporte de gastos',
  pyl: 'Estado de resultados',
};

export function nombreArchivo(tipo: TipoReporte, formato: 'pdf' | 'xlsx', d: ReporteData) {
  return `mostrador-${tipo}-${d.desde}_a_${d.hasta}.${formato}`;
}

/* ============================ PDF ============================ */

export function generarPDF(tipo: TipoReporte, d: ReporteData): Uint8Array {
  const doc = new jsPDF();
  const margin = 14;

  doc.setFontSize(16);
  doc.text(d.empresaNombre, margin, 18);
  doc.setFontSize(12);
  doc.setTextColor(90);
  doc.text(TITULO[tipo], margin, 25);
  doc.setFontSize(9);
  doc.text(`Período: ${d.desde} a ${d.hasta}`, margin, 31);
  doc.setTextColor(0);

  let startY = 38;

  if (tipo === 'ventas') {
    autoTable(doc, {
      startY,
      head: [['#', 'Fecha', 'Método', 'Total']],
      body: d.ventas.map((v) => [
        v.numero_venta,
        fechaCorta(v.fecha),
        METODO[v.metodo_pago] ?? v.metodo_pago,
        cop(v.total),
      ]),
      foot: [['', '', 'Total', cop(d.totalVentas)]],
      headStyles: { fillColor: [30, 30, 30] },
      footStyles: { fillColor: [240, 240, 238], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8 },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y,
      head: [['Método de pago', 'Ventas', 'Total']],
      body: d.ventasPorMetodo.map((m) => [METODO[m.metodo] ?? m.metodo, m.count, cop(m.total)]),
      headStyles: { fillColor: [30, 30, 30] },
      styles: { fontSize: 8 },
    });
  } else if (tipo === 'egresos') {
    autoTable(doc, {
      startY,
      head: [['Fecha', 'Categoría', 'Proveedor', 'Monto']],
      body: d.egresos.map((e) => [
        fechaCorta(e.fecha),
        CATEGORIA[e.categoria] ?? e.categoria,
        e.proveedor ?? '—',
        cop(e.monto),
      ]),
      foot: [['', '', 'Total', cop(d.totalEgresos)]],
      headStyles: { fillColor: [30, 30, 30] },
      footStyles: { fillColor: [240, 240, 238], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8 },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Movimientos', 'Total']],
      body: d.egresosPorCategoria.map((c) => [CATEGORIA[c.categoria] ?? c.categoria, c.count, cop(c.total)]),
      headStyles: { fillColor: [30, 30, 30] },
      styles: { fontSize: 8 },
    });
  } else {
    const utilidadBruta = d.totalVentas - d.costoMercancia;
    const utilidadNeta = utilidadBruta - d.totalEgresos;
    autoTable(doc, {
      startY,
      head: [['Concepto', 'Monto']],
      body: [
        ['Ingresos por ventas', cop(d.totalVentas)],
        ['(-) Costo de mercancía vendida', cop(d.costoMercancia)],
        ['= Utilidad bruta', cop(utilidadBruta)],
        ['(-) Gastos operacionales', cop(d.totalEgresos)],
      ],
      foot: [['= Utilidad neta', cop(utilidadNeta)]],
      headStyles: { fillColor: [30, 30, 30] },
      footStyles: { fillColor: [240, 240, 238], textColor: 0, fontStyle: 'bold', fontSize: 11 },
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'right' } },
    });
  }

  const buf = doc.output('arraybuffer');
  return new Uint8Array(buf);
}

/* ============================ Excel ============================ */

export async function generarExcel(tipo: TipoReporte, d: ReporteData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mostrador';
  wb.created = new Date();

  const moneda = '"$"#,##0';

  if (tipo === 'ventas') {
    const ws = wb.addWorksheet('Ventas');
    ws.columns = [
      { header: '# Venta', key: 'num', width: 12 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Total', key: 'total', width: 16, style: { numFmt: moneda } },
    ];
    d.ventas.forEach((v) =>
      ws.addRow({
        num: v.numero_venta,
        fecha: fechaCorta(v.fecha),
        metodo: METODO[v.metodo_pago] ?? v.metodo_pago,
        total: v.total,
      }),
    );
    ws.addRow({});
    const tot = ws.addRow({ metodo: 'Total', total: d.totalVentas });
    tot.font = { bold: true };
  } else if (tipo === 'egresos') {
    const ws = wb.addWorksheet('Gastos');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Categoría', key: 'cat', width: 18 },
      { header: 'Proveedor', key: 'prov', width: 22 },
      { header: 'Descripción', key: 'desc', width: 30 },
      { header: 'Monto', key: 'monto', width: 16, style: { numFmt: moneda } },
    ];
    d.egresos.forEach((e) =>
      ws.addRow({
        fecha: fechaCorta(e.fecha),
        cat: CATEGORIA[e.categoria] ?? e.categoria,
        prov: e.proveedor ?? '',
        desc: e.descripcion ?? '',
        monto: e.monto,
      }),
    );
    ws.addRow({});
    const tot = ws.addRow({ desc: 'Total', monto: d.totalEgresos });
    tot.font = { bold: true };
  } else {
    const utilidadBruta = d.totalVentas - d.costoMercancia;
    const utilidadNeta = utilidadBruta - d.totalEgresos;
    const ws = wb.addWorksheet('Estado de resultados');
    ws.columns = [
      { header: 'Concepto', key: 'c', width: 34 },
      { header: 'Monto', key: 'm', width: 18, style: { numFmt: moneda } },
    ];
    ws.addRow({ c: 'Ingresos por ventas', m: d.totalVentas });
    ws.addRow({ c: '(-) Costo de mercancía vendida', m: d.costoMercancia });
    ws.addRow({ c: '= Utilidad bruta', m: utilidadBruta }).font = { bold: true };
    ws.addRow({ c: '(-) Gastos operacionales', m: d.totalEgresos });
    ws.addRow({ c: '= Utilidad neta', m: utilidadNeta }).font = { bold: true };
  }

  // Encabezado en negrita en todas las hojas
  wb.eachSheet((ws) => {
    ws.getRow(1).font = { bold: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

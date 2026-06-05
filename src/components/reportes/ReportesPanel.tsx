'use client';

import { useState } from 'react';
import { FileText, FileSpreadsheet, ShoppingCart, Receipt, Scale } from 'lucide-react';

type Preset = 'mes' | 'mesPasado' | '30d' | 'custom';

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangoPreset(p: Exclude<Preset, 'custom'>): { desde: string; hasta: string } {
  const hoy = new Date();
  if (p === '30d') {
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - 29);
    return { desde: ymd(desde), hasta: ymd(hoy) };
  }
  if (p === 'mes') {
    return { desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: ymd(hoy) };
  }
  // mesPasado
  return {
    desde: ymd(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    hasta: ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
  };
}

const REPORTES = [
  {
    tipo: 'ventas',
    titulo: 'Ventas',
    desc: 'Listado de ventas con método de pago y totales.',
    icon: ShoppingCart,
    color: 'var(--ingreso)',
  },
  {
    tipo: 'egresos',
    titulo: 'Gastos',
    desc: 'Listado de gastos por categoría y proveedor.',
    icon: Receipt,
    color: 'var(--egreso)',
  },
  {
    tipo: 'pyl',
    titulo: 'Estado de resultados',
    desc: 'Ingresos − costos − gastos = utilidad neta.',
    icon: Scale,
    color: 'var(--utilidad)',
  },
] as const;

export function ReportesPanel() {
  const [preset, setPreset] = useState<Preset>('mes');
  const inicial = rangoPreset('mes');
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);

  function aplicarPreset(p: Exclude<Preset, 'custom'>) {
    setPreset(p);
    const r = rangoPreset(p);
    setDesde(r.desde);
    setHasta(r.hasta);
  }

  const url = (tipo: string, formato: 'pdf' | 'xlsx') =>
    `/api/reportes?tipo=${tipo}&formato=${formato}&desde=${desde}&hasta=${hasta}`;

  return (
    <div className="space-y-6">
      {/* Selector de período */}
      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Período</h2>
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['mes', 'Este mes'],
            ['mesPasado', 'Mes pasado'],
            ['30d', 'Últimos 30 días'],
            ['custom', 'Personalizado'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => (key === 'custom' ? setPreset('custom') : aplicarPreset(key))}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                preset === key
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => {
                setDesde(e.target.value);
                setPreset('custom');
              }}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Hasta</span>
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => {
                setHasta(e.target.value);
                setPreset('custom');
              }}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
        </div>
      </section>

      {/* Reportes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {REPORTES.map((r) => {
          const Icon = r.icon;
          return (
            <section key={r.tipo} className="flex flex-col rounded-3xl bg-card p-5 shadow-sm">
              <span
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `color-mix(in oklch, ${r.color} 15%, transparent)` }}
              >
                <Icon className="h-5 w-5" style={{ color: r.color }} />
              </span>
              <h3 className="font-semibold">{r.titulo}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.desc}</p>
              <div className="mt-4 flex gap-2">
                <a
                  href={url(r.tipo, 'pdf')}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-foreground text-sm font-medium text-background"
                >
                  <FileText className="h-4 w-4" /> PDF
                </a>
                <a
                  href={url(r.tipo, 'xlsx')}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </a>
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Los reportes se generan con los datos del período seleccionado.
      </p>
    </div>
  );
}

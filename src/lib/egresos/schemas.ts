import { z } from 'zod';

export const CATEGORIAS_EGRESO = [
  'proveedores',
  'arriendo',
  'servicios',
  'nomina',
  'impuestos',
  'transporte',
  'mantenimiento',
  'otros',
] as const;

export type CategoriaEgreso = (typeof CATEGORIAS_EGRESO)[number];

export const CATEGORIA_INFO: Record<CategoriaEgreso, { label: string; color: string; emoji: string }> = {
  proveedores:   { label: 'Proveedores',   color: '#d97706', emoji: '📦' },
  arriendo:      { label: 'Arriendo',      color: '#0891b2', emoji: '🏠' },
  servicios:     { label: 'Servicios',     color: '#dc2626', emoji: '💡' },
  nomina:        { label: 'Nómina',        color: '#16a34a', emoji: '👥' },
  impuestos:     { label: 'Impuestos',     color: '#7c3aed', emoji: '🧾' },
  transporte:    { label: 'Transporte',    color: '#ea580c', emoji: '🚚' },
  mantenimiento: { label: 'Mantenimiento', color: '#0284c7', emoji: '🔧' },
  otros:         { label: 'Otros',         color: '#737373', emoji: '📌' },
};

const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) || 0 : v));

const dateString = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v));

export const egresoSchema = z.object({
  categoria: z.enum(CATEGORIAS_EGRESO),
  proveedor: z.string().max(120).trim().optional().or(z.literal('')),
  descripcion: z.string().max(500).trim().optional().or(z.literal('')),
  monto: moneyString.pipe(z.number().positive({ error: 'El monto debe ser mayor a 0' })),
  fecha: dateString.pipe(z.iso.date({ error: 'Fecha inválida' })),
  metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'breb']).default('efectivo'),
  comprobante_url: z.string().url().optional().or(z.literal('')),
});

export type EgresoInput = z.infer<typeof egresoSchema>;

export const egresoDesdeIASchema = z.object({
  numero_emisor: z.string().min(5),
  proveedor: z.string().max(120).optional(),
  monto: z.number().positive(),
  fecha: z.string().optional(),
  categoria: z.enum(CATEGORIAS_EGRESO).optional(),
  descripcion: z.string().max(500).optional(),
  comprobante_url: z.string().url().optional(),
});

import { z } from 'zod';

const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) || 0 : v));

export const productoSchema = z.object({
  nombre: z.string().min(2, { error: 'El nombre es muy corto' }).max(200).trim(),
  descripcion: z.string().max(500).trim().optional().or(z.literal('')),
  sku: z.string().trim().optional().or(z.literal('')),
  codigo_barras: z.string().trim().optional().or(z.literal('')),
  categoria_id: z.union([z.uuid(), z.literal(''), z.null()]).optional(),
  precio_compra: moneyString.pipe(z.number().min(0, { error: 'No puede ser negativo' })),
  precio_venta: moneyString.pipe(z.number().positive({ error: 'Debe ser mayor a 0' })),
  stock_actual: moneyString.pipe(z.number().int().min(0)),
  stock_minimo: moneyString.pipe(z.number().int().min(0)),
  activo: z.union([z.boolean(), z.literal('on'), z.literal('off')]).optional().default(true),
});

export const categoriaSchema = z.object({
  nombre: z.string().min(2).max(60).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Color hex inválido' }).default('#6366f1'),
});

export type ProductoInput = z.infer<typeof productoSchema>;
export type CategoriaInput = z.infer<typeof categoriaSchema>;

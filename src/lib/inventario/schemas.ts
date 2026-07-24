import { z } from 'zod';

const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) || 0 : v));

// Una opción/combo del producto: nombre + su precio completo.
// `bebida: true` = al vender esta opción se elige una bebida del Inventario.
const varianteItemSchema = z.object({
  nombre: z.string().min(1, { error: 'Cada opción necesita un nombre' }).max(60).trim(),
  precio: moneyString.pipe(z.number().min(0, { error: 'Precio inválido' })),
  bebida: z.boolean().optional().default(false),
});

// Llega del formulario como un string JSON (hidden input). Lo parseamos,
// descartamos basura y validamos. Si algo falla, queda como lista vacía.
export const variantesSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })
  .pipe(z.array(varianteItemSchema).max(20, { error: 'Máximo 20 opciones' }));

export type VarianteItem = z.infer<typeof varianteItemSchema>;

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
  variantes: variantesSchema,
  // '1' cuando el producto base pide elegir bebida al venderlo.
  pide_bebida: z
    .union([z.string(), z.boolean(), z.null(), z.undefined()])
    .transform((v) => v === '1' || v === true),
});

export const categoriaSchema = z.object({
  nombre: z.string().min(2).max(60).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Color hex inválido' }).default('#6366f1'),
});

export type ProductoInput = z.infer<typeof productoSchema>;
export type CategoriaInput = z.infer<typeof categoriaSchema>;

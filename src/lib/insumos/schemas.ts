import { z } from 'zod';
import { UNIDAD_VALUES } from './units';
import { MODULO_VALUES } from './modulos';

export const insumoSchema = z.object({
  nombre: z.string().trim().min(1, { error: 'El nombre es obligatorio' }).max(80),
  tipo: z.enum(MODULO_VALUES as [string, ...string[]]).default('materia_prima'),
  unidad: z.enum(UNIDAD_VALUES as [string, ...string[]]),
  stock_actual: z.coerce.number().min(0).default(0),
  stock_minimo: z.coerce.number().min(0).default(0),
  costo_unitario: z.coerce.number().min(0).default(0),
});

export type InsumoInput = z.infer<typeof insumoSchema>;

// Una línea de receta: qué insumo y cuánto por unidad del producto.
export const recetaLineaSchema = z.object({
  insumo_id: z.uuid(),
  cantidad: z.coerce.number().positive({ error: 'La cantidad debe ser mayor a 0' }),
});

export const recetaSchema = z.array(recetaLineaSchema);
export type RecetaLinea = z.infer<typeof recetaLineaSchema>;

// Agregar stock (compra manual): cantidad + unidad en que se compró (se convierte).
export const agregarStockSchema = z.object({
  insumo_id: z.uuid(),
  cantidad: z.coerce.number().positive({ error: 'Ingresa una cantidad válida' }),
  unidad: z.enum(UNIDAD_VALUES as [string, ...string[]]),
  costo_total: z.coerce.number().min(0).optional(),
});

// Ajuste manual (merma/corrección): fija el nuevo stock.
export const ajusteStockSchema = z.object({
  insumo_id: z.uuid(),
  nuevo_stock: z.coerce.number().min(0),
  motivo: z.string().trim().max(120).optional(),
});

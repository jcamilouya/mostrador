/**
 * Módulos del Inventario. Un item de inventario pertenece a un módulo.
 * Solo `materia_prima` alimenta las recetas de productos.
 */
export type ModuloInventario = 'materia_prima' | 'bebidas' | 'confiteria' | 'activos';

export type ModuloDef = {
  value: ModuloInventario;
  label: string;
  singular: string;
  emoji: string;
  descripcion: string;
};

export const MODULOS: readonly ModuloDef[] = [
  {
    value: 'materia_prima',
    label: 'Materia prima',
    singular: 'ingrediente',
    emoji: '🥕',
    descripcion: 'Ingredientes que se usan en las recetas (pan, carne, tomate…).',
  },
  {
    value: 'bebidas',
    label: 'Bebidas',
    singular: 'bebida',
    emoji: '🥤',
    descripcion: 'Gaseosas, cervezas, jugos… (Coca-Cola, Águila…).',
  },
  {
    value: 'confiteria',
    label: 'Confitería y desechables',
    singular: 'ítem',
    emoji: '🍬',
    descripcion: 'Servilletas, pitillos, palillos, empaques, dulces…',
  },
  {
    value: 'activos',
    label: 'Activos',
    singular: 'activo',
    emoji: '🪑',
    descripcion: 'Mesas, sillas, computadores, datáfonos, equipos de cocina, mobiliario.',
  },
] as const;

export const MODULO_VALUES = MODULOS.map((m) => m.value);

export function getModulo(value: string): ModuloDef | undefined {
  return MODULOS.find((m) => m.value === value);
}

export function moduloLabel(value: string): string {
  return getModulo(value)?.label ?? value;
}

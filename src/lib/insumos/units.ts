/**
 * Unidades de medida para insumos y conversiones dentro de una misma dimensión
 * (masa: g/kg/lb, volumen: ml/L, conteo: unidad). El factor es el valor de 1 de
 * esa unidad expresado en la unidad base de su dimensión (g, ml o unidad).
 */
export type Dimension = 'masa' | 'volumen' | 'conteo';

export type UnidadDef = {
  value: string;
  label: string;
  corto: string;
  dim: Dimension;
  factor: number;
};

export const UNIDADES: readonly UnidadDef[] = [
  { value: 'unidad', label: 'Unidad', corto: 'u', dim: 'conteo', factor: 1 },
  { value: 'g', label: 'Gramos', corto: 'g', dim: 'masa', factor: 1 },
  { value: 'kg', label: 'Kilos', corto: 'kg', dim: 'masa', factor: 1000 },
  { value: 'lb', label: 'Libras', corto: 'lb', dim: 'masa', factor: 500 },
  { value: 'ml', label: 'Mililitros', corto: 'ml', dim: 'volumen', factor: 1 },
  { value: 'L', label: 'Litros', corto: 'L', dim: 'volumen', factor: 1000 },
] as const;

export const UNIDAD_VALUES = UNIDADES.map((u) => u.value);

export function getUnidad(value: string): UnidadDef | undefined {
  return UNIDADES.find((u) => u.value === value);
}

export function unidadCorta(value: string): string {
  return getUnidad(value)?.corto ?? value;
}

/** Unidades compatibles (misma dimensión) con la unidad dada — para el dropdown de "agregar compra". */
export function unidadesCompatibles(value: string): UnidadDef[] {
  const base = getUnidad(value);
  if (!base) return [];
  return UNIDADES.filter((u) => u.dim === base.dim);
}

/**
 * Convierte una cantidad de una unidad a otra (misma dimensión). Devuelve null si
 * las dimensiones no coinciden (ej. gramos → litros).
 */
export function convertir(cantidad: number, desde: string, hacia: string): number | null {
  const a = getUnidad(desde);
  const b = getUnidad(hacia);
  if (!a || !b || a.dim !== b.dim) return null;
  return (cantidad * a.factor) / b.factor;
}

/** Formatea una cantidad con su unidad corta (ej. "1.5 kg", "3 u"). */
export function formatCantidad(cantidad: number, unidad: string): string {
  const n = Number.isInteger(cantidad) ? cantidad : Number(cantidad.toFixed(3));
  return `${n} ${unidadCorta(unidad)}`;
}

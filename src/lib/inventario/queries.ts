import { createClient } from '@/lib/supabase/server';
import type { VarianteItem } from './schemas';

export type { VarianteItem };

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigo_barras: string | null;
  precio_compra: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  categoria_id: string | null;
  imagen_url: string | null;
  variantes: VarianteItem[];
  pide_bebida: boolean;
  categorias: { nombre: string; color: string } | null;
};

/** Normaliza el JSONB de variantes a un arreglo limpio de { nombre, precio, bebida }. */
export function normalizarVariantes(raw: unknown): VarianteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => ({
      nombre: typeof v?.nombre === 'string' ? v.nombre : '',
      precio: Number(v?.precio) || 0,
      bebida: v?.bebida === true,
    }))
    .filter((v) => v.nombre.trim().length > 0);
}

export type Categoria = {
  id: string;
  nombre: string;
  color: string;
};

export async function getEmpresaIdDelUsuario(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  return data?.empresa_id ?? null;
}

export async function getProductos(empresaId: string): Promise<Producto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias (nombre, color)')
    .eq('empresa_id', empresaId)
    .order('nombre');

  if (error || !data) return [];
  return data.map((p) => ({
    ...p,
    precio_compra: Number(p.precio_compra),
    precio_venta: Number(p.precio_venta),
    variantes: normalizarVariantes(p.variantes),
    pide_bebida: p.pide_bebida === true,
    categorias: Array.isArray(p.categorias) ? p.categorias[0] ?? null : p.categorias,
  })) as Producto[];
}

export async function getProducto(empresaId: string, id: string): Promise<Producto | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('productos')
    .select('*, categorias (nombre, color)')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    precio_compra: Number(data.precio_compra),
    precio_venta: Number(data.precio_venta),
    variantes: normalizarVariantes(data.variantes),
    pide_bebida: data.pide_bebida === true,
    categorias: Array.isArray(data.categorias) ? data.categorias[0] ?? null : data.categorias,
  } as Producto;
}

export async function getCategorias(empresaId: string): Promise<Categoria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, color')
    .eq('empresa_id', empresaId)
    .order('nombre');
  if (error || !data) return [];
  return data as Categoria[];
}

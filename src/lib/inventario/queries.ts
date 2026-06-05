import { createClient } from '@/lib/supabase/server';

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
  categorias: { nombre: string; color: string } | null;
};

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

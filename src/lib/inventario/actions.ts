'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { productoSchema, categoriaSchema } from './schemas';

export type ActionState = { error?: string; ok?: boolean };

async function requireEmpresaId(): Promise<{ empresaId: string; userId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data?.empresa_id) return null;
  return { empresaId: data.empresa_id, userId: user.id };
}

function generarSku(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toUpperCase()
    .slice(0, 10);
  return `${slug}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function subirImagenProducto(
  file: File,
  empresaId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${empresaId}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { data, error } = await admin.storage
    .from('productos')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error || !data) return null;
  const { data: urlData } = admin.storage.from('productos').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function crearProducto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireEmpresaId();
  if (!session) redirect('/login');

  const parsed = productoSchema.safeParse({
    nombre: formData.get('nombre'),
    descripcion: formData.get('descripcion') ?? '',
    sku: formData.get('sku') ?? '',
    codigo_barras: formData.get('codigo_barras') ?? '',
    categoria_id: formData.get('categoria_id') || null,
    precio_compra: formData.get('precio_compra') ?? '0',
    precio_venta: formData.get('precio_venta') ?? '0',
    stock_actual: formData.get('stock_actual') ?? '0',
    stock_minimo: formData.get('stock_minimo') ?? '5',
    activo: true,
    variantes: formData.get('variantes'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  let imagen_url: string | null = null;
  const imagenFile = formData.get('imagen') as File | null;
  if (imagenFile && imagenFile.size > 0) {
    imagen_url = await subirImagenProducto(imagenFile, session.empresaId);
  }

  const admin = createAdminClient();
  const { error } = await admin.from('productos').insert({
    empresa_id: session.empresaId,
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion || null,
    sku: parsed.data.sku || generarSku(parsed.data.nombre),
    codigo_barras: parsed.data.codigo_barras || null,
    categoria_id: parsed.data.categoria_id || null,
    precio_compra: parsed.data.precio_compra,
    precio_venta: parsed.data.precio_venta,
    stock_actual: parsed.data.stock_actual,
    stock_minimo: parsed.data.stock_minimo,
    activo: true,
    variantes: parsed.data.variantes,
    imagen_url,
  });

  if (error) return { error: 'No pudimos guardar el producto. Intenta de nuevo.' };

  revalidatePath('/dashboard/inventario');
  redirect('/dashboard/inventario');
}

export async function actualizarProducto(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireEmpresaId();
  if (!session) redirect('/login');

  const parsed = productoSchema.safeParse({
    nombre: formData.get('nombre'),
    descripcion: formData.get('descripcion') ?? '',
    sku: formData.get('sku') ?? '',
    codigo_barras: formData.get('codigo_barras') ?? '',
    categoria_id: formData.get('categoria_id') || null,
    precio_compra: formData.get('precio_compra') ?? '0',
    precio_venta: formData.get('precio_venta') ?? '0',
    stock_actual: formData.get('stock_actual') ?? '0',
    stock_minimo: formData.get('stock_minimo') ?? '5',
    activo: formData.get('activo') !== 'off',
    variantes: formData.get('variantes'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  // Imagen: nueva subida > quitar > mantener existente
  let imagen_url: string | null | undefined = undefined;
  const quitarImagen = formData.get('quitar_imagen') === '1';
  const imagenFile = formData.get('imagen') as File | null;

  if (quitarImagen) {
    imagen_url = null;
  } else if (imagenFile && imagenFile.size > 0) {
    imagen_url = await subirImagenProducto(imagenFile, session.empresaId);
  }

  const admin = createAdminClient();
  const updatePayload: Record<string, unknown> = {
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion || null,
    sku: parsed.data.sku || null,
    codigo_barras: parsed.data.codigo_barras || null,
    categoria_id: parsed.data.categoria_id || null,
    precio_compra: parsed.data.precio_compra,
    precio_venta: parsed.data.precio_venta,
    stock_actual: parsed.data.stock_actual,
    stock_minimo: parsed.data.stock_minimo,
    activo: parsed.data.activo !== false && parsed.data.activo !== 'off',
    variantes: parsed.data.variantes,
    updated_at: new Date().toISOString(),
  };
  if (imagen_url !== undefined) updatePayload.imagen_url = imagen_url;

  const { error } = await admin
    .from('productos')
    .update(updatePayload)
    .eq('id', id)
    .eq('empresa_id', session.empresaId);

  if (error) return { error: 'No pudimos actualizar el producto.' };

  revalidatePath('/dashboard/inventario');
  redirect('/dashboard/inventario');
}

export async function archivarProducto(id: string): Promise<void> {
  const session = await requireEmpresaId();
  if (!session) return;
  const admin = createAdminClient();
  await admin
    .from('productos')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', session.empresaId);
  revalidatePath('/dashboard/inventario');
}

export async function eliminarProducto(id: string): Promise<void> {
  const session = await requireEmpresaId();
  if (!session) return;
  const admin = createAdminClient();
  await admin.from('productos').delete().eq('id', id).eq('empresa_id', session.empresaId);
  revalidatePath('/dashboard/inventario');
}

export type CategoriaCreada = { id: string; nombre: string; color: string };

export async function crearCategoria(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { categoria?: CategoriaCreada }> {
  const session = await requireEmpresaId();
  if (!session) redirect('/login');

  const parsed = categoriaSchema.safeParse({
    nombre: formData.get('nombre'),
    color: formData.get('color') || '#6366f1',
  });
  if (!parsed.success) return { error: 'El nombre es muy corto' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('categorias')
    .insert({
      empresa_id: session.empresaId,
      nombre: parsed.data.nombre,
      color: parsed.data.color,
    })
    .select('id, nombre, color')
    .single();
  if (error || !data) return { error: 'No pudimos crear la categoría.' };

  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/inventario/nuevo');
  return {
    ok: true,
    categoria: { id: data.id as string, nombre: data.nombre as string, color: data.color as string },
  };
}

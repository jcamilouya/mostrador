'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reemplazarReceta } from '@/lib/insumos/consumo';
import { productoSchema, categoriaSchema } from './schemas';

export type ActionState = { error?: string; ok?: boolean };

/** Lee el campo `receta` (JSON) del formulario de producto. */
function parseReceta(raw: FormDataEntryValue | null): { insumo_id: string; cantidad: number }[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is { insumo_id: string; cantidad: number } =>
          !!x && typeof x.insumo_id === 'string' && Number(x.cantidad) > 0,
      )
      .map((x) => ({ insumo_id: x.insumo_id, cantidad: Number(x.cantidad) }));
  } catch {
    return [];
  }
}

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
    pide_bebida: formData.get('pide_bebida'),
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

  // Un producto CON RECETA se prepara: su stock son los ingredientes, no un
  // número a mano. Guardarlo en 0 evita que ese número fantasma lo "agote".
  const receta = parseReceta(formData.get('receta'));
  const sePrepara = receta.length > 0;

  const { data: nuevo, error } = await admin
    .from('productos')
    .insert({
      empresa_id: session.empresaId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion || null,
      sku: parsed.data.sku || generarSku(parsed.data.nombre),
      codigo_barras: parsed.data.codigo_barras || null,
      categoria_id: parsed.data.categoria_id || null,
      precio_compra: parsed.data.precio_compra,
      precio_venta: parsed.data.precio_venta,
      stock_actual: sePrepara ? 0 : parsed.data.stock_actual,
      stock_minimo: sePrepara ? 0 : parsed.data.stock_minimo,
      activo: true,
      variantes: parsed.data.variantes,
      pide_bebida: parsed.data.pide_bebida,
      imagen_url,
    })
    .select('id')
    .single();

  if (error || !nuevo) return { error: 'No pudimos guardar el producto. Intenta de nuevo.' };

  await reemplazarReceta(admin, session.empresaId, nuevo.id, receta);

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
    pide_bebida: formData.get('pide_bebida'),
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

  // Si el producto está conectado a un ítem del Inventario, su stock lo manda
  // ese ítem: el formulario ni siquiera muestra los campos, así que no hay que
  // sobrescribirlos (los pondría en 0).
  const { data: actual } = await admin
    .from('productos')
    .select('insumo_id')
    .eq('id', id)
    .eq('empresa_id', session.empresaId)
    .maybeSingle();
  const vinculado = Boolean((actual as Record<string, unknown> | null)?.insumo_id);

  // Con receta el stock son los ingredientes: se guarda en 0 y el formulario
  // ni siquiera pide el número.
  const receta = parseReceta(formData.get('receta'));
  const sePrepara = receta.length > 0;

  const updatePayload: Record<string, unknown> = {
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion || null,
    sku: parsed.data.sku || null,
    codigo_barras: parsed.data.codigo_barras || null,
    categoria_id: parsed.data.categoria_id || null,
    precio_compra: parsed.data.precio_compra,
    precio_venta: parsed.data.precio_venta,
    // OJO: `activo` NO se toca aquí. El formulario no tiene ese campo, así que
    // `formData.get('activo')` siempre era null y "null !== 'off'" daba true:
    // editar un producto archivado lo revivía solo y reaparecía en el POS.
    // Archivar/restaurar tiene sus propias acciones.
    variantes: parsed.data.variantes,
    pide_bebida: parsed.data.pide_bebida,
    updated_at: new Date().toISOString(),
  };
  if (sePrepara) {
    updatePayload.stock_actual = 0;
    updatePayload.stock_minimo = 0;
  } else if (!vinculado) {
    updatePayload.stock_actual = parsed.data.stock_actual;
    updatePayload.stock_minimo = parsed.data.stock_minimo;
  }
  if (imagen_url !== undefined) updatePayload.imagen_url = imagen_url;

  const { error } = await admin
    .from('productos')
    .update(updatePayload)
    .eq('id', id)
    .eq('empresa_id', session.empresaId);

  if (error) return { error: 'No pudimos actualizar el producto.' };

  await reemplazarReceta(admin, session.empresaId, id, receta);

  revalidatePath('/dashboard/inventario');
  redirect('/dashboard/inventario');
}

export type LineaCarta = {
  nombre: string;
  precio: number;
  categoria?: string | null;
  descripcion?: string | null;
};

/**
 * Crea de un golpe los productos leídos de la foto de la carta, con sus
 * categorías. Es el paso que le quita al dueño teclear cuarenta productos.
 *
 * - Se salta los que ya existen con ese nombre (se puede repetir la foto sin
 *   duplicar la carta).
 * - Crea las categorías que falten, reusando las que ya tenga.
 */
export async function crearProductosDesdeCarta(
  lineas: LineaCarta[],
): Promise<{ ok: boolean; creados?: number; omitidos?: number; error?: string }> {
  const session = await requireEmpresaId();
  if (!session) return { ok: false, error: 'No autenticado' };
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { ok: false, error: 'No hay productos para crear' };
  }
  if (lineas.length > 300) {
    return { ok: false, error: 'Son demasiados productos de una sola vez (máximo 300).' };
  }

  const admin = createAdminClient();
  const empresaId = session.empresaId;

  const clave = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Lo que ya existe: ni productos ni categorías se duplican.
  const [{ data: existentes }, { data: cats }] = await Promise.all([
    admin.from('productos').select('nombre').eq('empresa_id', empresaId),
    admin.from('categorias').select('id, nombre').eq('empresa_id', empresaId),
  ]);
  const yaHay = new Set((existentes ?? []).map((p) => clave(p.nombre as string)));
  const catPorNombre = new Map<string, string>(
    (cats ?? []).map((c) => [clave(c.nombre as string), c.id as string]),
  );

  // Crear las categorías nuevas que menciona la carta.
  const COLORES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
  const nuevasCats = [
    ...new Set(
      lineas
        .map((l) => (l.categoria ?? '').trim())
        .filter((c) => c.length > 0 && !catPorNombre.has(clave(c))),
    ),
  ];
  for (const [i, nombre] of nuevasCats.entries()) {
    const { data } = await admin
      .from('categorias')
      .insert({ empresa_id: empresaId, nombre, color: COLORES[i % COLORES.length] })
      .select('id')
      .single();
    if (data) catPorNombre.set(clave(nombre), data.id as string);
  }

  const filas = [];
  let omitidos = 0;
  for (const l of lineas) {
    const nombre = (l.nombre ?? '').trim();
    const precio = Math.max(0, Math.round(Number(l.precio) || 0));
    if (nombre.length < 2 || precio <= 0) {
      omitidos++;
      continue;
    }
    if (yaHay.has(clave(nombre))) {
      omitidos++;
      continue;
    }
    yaHay.add(clave(nombre));
    const catId = l.categoria ? catPorNombre.get(clave(l.categoria)) ?? null : null;
    filas.push({
      empresa_id: empresaId,
      nombre,
      descripcion: (l.descripcion ?? '').trim() || null,
      sku: generarSku(nombre),
      categoria_id: catId,
      precio_compra: 0,
      precio_venta: precio,
      stock_actual: 0,
      stock_minimo: 0,
      activo: true,
      variantes: [],
      pide_bebida: false,
    });
  }

  if (filas.length === 0) {
    return { ok: false, error: 'Todos esos productos ya estaban en tu lista.' };
  }

  const { error } = await admin.from('productos').insert(filas);
  if (error) {
    console.error('[crearProductosDesdeCarta]', error);
    return { ok: false, error: 'No pudimos guardar los productos. Intenta de nuevo.' };
  }

  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard');
  return { ok: true, creados: filas.length, omitidos };
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

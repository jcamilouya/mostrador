'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { insumoSchema, agregarStockSchema, ajusteStockSchema } from './schemas';
import { convertir, UNIDAD_VALUES } from './units';

export type InsumoState = {
  ok?: boolean;
  error?: string;
  // Al crear una bebida: datos para ofrecer crearla como producto vendible.
  insumoId?: string;
  nombre?: string;
  sugerirProducto?: boolean;
  /** Stock con el que quedó el ítem recién creado. */
  stockInsumo?: number;
  /**
   * Ya existe un producto del POS con ese nombre: hay que CONECTARLOS, si no
   * quedan dos stocks separados del mismo artículo (vender no descontaría el
   * Inventario).
   */
  productoExistente?: { id: string; nombre: string; stock: number };
};

async function requireEmpresaId(): Promise<string | null> {
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

/**
 * Refresca TODAS las pantallas que muestran stock. Las bebidas conectadas
 * comparten stock con su producto del POS, así que un cambio en el Inventario
 * también cambia lo que ven el POS y la lista de productos.
 */
function refrescar() {
  revalidatePath('/dashboard/insumos');
  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard');
}

export async function crearInsumo(_prev: InsumoState, formData: FormData): Promise<InsumoState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = insumoSchema.safeParse({
    nombre: formData.get('nombre'),
    tipo: formData.get('tipo') ?? 'materia_prima',
    unidad: formData.get('unidad'),
    stock_actual: formData.get('stock_actual') ?? '0',
    stock_minimo: formData.get('stock_minimo') ?? '0',
    costo_unitario: formData.get('costo_unitario') ?? '0',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: insumo, error } = await admin
    .from('insumos')
    .insert({
      empresa_id: empresaId,
      nombre: d.nombre,
      tipo: d.tipo,
      unidad: d.unidad,
      stock_actual: d.stock_actual,
      stock_minimo: d.stock_minimo,
      costo_unitario: d.costo_unitario,
    })
    .select('id')
    .single();
  if (error || !insumo) return { error: 'No pudimos guardar el ingrediente.' };

  if (d.stock_actual > 0) {
    await admin.from('movimientos_insumos').insert({
      empresa_id: empresaId,
      insumo_id: insumo.id,
      tipo: 'entrada',
      cantidad: d.stock_actual,
      referencia_tipo: 'inicial',
      notas: 'Stock inicial',
    });
  }

  // Si es bebida: o se ofrece crear el producto para venderla, o —si ya existe
  // un producto con ese nombre— se ofrece CONECTARLOS para que compartan stock.
  let sugerirProducto = false;
  let productoExistente: InsumoState['productoExistente'];
  if (d.tipo === 'bebidas') {
    const { data: existente } = await admin
      .from('productos')
      .select('id, nombre, stock_actual')
      .eq('empresa_id', empresaId)
      .is('insumo_id', null)
      .ilike('nombre', d.nombre)
      .limit(1);
    if (existente && existente.length > 0) {
      productoExistente = {
        id: existente[0].id as string,
        nombre: existente[0].nombre as string,
        stock: Number(existente[0].stock_actual) || 0,
      };
    } else {
      sugerirProducto = true;
    }
  }

  refrescar();
  return {
    ok: true,
    insumoId: insumo.id,
    nombre: d.nombre,
    stockInsumo: d.stock_actual,
    sugerirProducto,
    productoExistente,
  };
}

/**
 * Conecta un PRODUCTO del POS con un INSUMO del Inventario: a partir de aquí
 * comparten UN SOLO stock (fuente de verdad: el insumo). Arregla el caso de
 * tener el mismo artículo duplicado en las dos pantallas, donde vender bajaba
 * un stock y el otro se quedaba igual.
 */
export async function vincularProductoConInsumo(
  insumoId: string,
  productoId: string,
  stockReal: number,
): Promise<{ ok: boolean; error?: string }> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { ok: false, error: 'No autenticado' };
  const stock = Number(stockReal);
  if (!Number.isFinite(stock) || stock < 0) {
    return { ok: false, error: 'Escribe cuántas unidades tienes de verdad' };
  }

  const admin = createAdminClient();

  const { data: insumo } = await admin
    .from('insumos')
    .select('id, nombre, stock_actual')
    .eq('id', insumoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!insumo) return { ok: false, error: 'No encontramos ese ítem del inventario' };

  const { data: producto, error: prodErr } = await admin
    .from('productos')
    .select('id, insumo_id')
    .eq('id', productoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (prodErr) {
    return { ok: false, error: 'Falta correr la migración 012 en Supabase.' };
  }
  if (!producto) return { ok: false, error: 'No encontramos ese producto' };
  const yaVinculadoA = (producto as Record<string, unknown>).insumo_id as string | null;
  if (yaVinculadoA && yaVinculadoA !== insumoId) {
    return { ok: false, error: 'Ese producto ya está conectado con otro ítem del inventario.' };
  }

  // Un insumo solo puede tener un producto conectado (si no, se descontaría dos veces).
  const { data: otro } = await admin
    .from('productos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('insumo_id', insumoId)
    .neq('id', productoId)
    .limit(1);
  if (otro && otro.length > 0) {
    return { ok: false, error: 'Este ítem ya está conectado con otro producto del POS.' };
  }

  const { error: linkErr } = await admin
    .from('productos')
    .update({
      insumo_id: insumoId,
      // Se mantiene igual al insumo por si algún día se desconectan.
      stock_actual: Math.floor(stock),
      updated_at: new Date().toISOString(),
    })
    .eq('id', productoId)
    .eq('empresa_id', empresaId);
  if (linkErr) {
    return { ok: false, error: 'No pudimos conectarlos. ¿Corriste la migración 012?' };
  }

  // El stock que dijo el dueño manda: queda como stock único del insumo.
  const anterior = Number(insumo.stock_actual) || 0;
  if (anterior !== stock) {
    await admin
      .from('insumos')
      .update({ stock_actual: stock, updated_at: new Date().toISOString() })
      .eq('id', insumoId)
      .eq('empresa_id', empresaId);
    await admin.from('movimientos_insumos').insert({
      empresa_id: empresaId,
      insumo_id: insumoId,
      tipo: 'ajuste',
      cantidad: Math.abs(stock - anterior),
      referencia_tipo: 'ajuste',
      notas: 'Ajuste al conectar con el producto del POS (stock único)',
    });
  }

  refrescar();
  return { ok: true };
}

/** Desconecta un producto de su insumo: cada uno vuelve a llevar su propio stock. */
export async function desvincularProducto(
  productoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { ok: false, error: 'No autenticado' };

  const admin = createAdminClient();
  const { data: producto, error } = await admin
    .from('productos')
    .select('id, insumo_id')
    .eq('id', productoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error || !producto) return { ok: false, error: 'No encontramos ese producto' };

  const insumoId = (producto as Record<string, unknown>).insumo_id as string | null;
  let stock = 0;
  if (insumoId) {
    const { data: insumo } = await admin
      .from('insumos')
      .select('stock_actual')
      .eq('id', insumoId)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    stock = Math.floor(Number(insumo?.stock_actual) || 0);
  }

  await admin
    .from('productos')
    .update({ insumo_id: null, stock_actual: stock, updated_at: new Date().toISOString() })
    .eq('id', productoId)
    .eq('empresa_id', empresaId);

  refrescar();
  return { ok: true };
}

/**
 * Crea un PRODUCTO vendible a partir de una bebida del Inventario, enlazado por
 * `insumo_id`. El stock queda ÚNICO: la fuente de verdad es el insumo.
 */
export async function crearProductoDesdeBebida(
  insumoId: string,
  precioVenta: number,
): Promise<{ ok: boolean; error?: string }> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { ok: false, error: 'No autenticado' };
  const precio = Number(precioVenta);
  if (!Number.isFinite(precio) || precio <= 0) {
    return { ok: false, error: 'Ingresa un precio de venta válido' };
  }

  const admin = createAdminClient();
  const { data: insumo } = await admin
    .from('insumos')
    .select('nombre, stock_actual, costo_unitario')
    .eq('id', insumoId)
    .eq('empresa_id', empresaId)
    .single();
  if (!insumo) return { ok: false, error: 'Bebida no encontrada' };

  // Si ya se creó el producto para esta bebida, no duplicarlo (dos productos
  // conectados al mismo insumo descontarían stock dos veces).
  const { data: yaCreado } = await admin
    .from('productos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('insumo_id', insumoId)
    .limit(1);
  if (yaCreado && yaCreado.length > 0) {
    return { ok: true };
  }

  // Categoría "Bebidas" (crear si no existe).
  let categoriaId: string | null = null;
  const { data: cat } = await admin
    .from('categorias')
    .select('id')
    .eq('empresa_id', empresaId)
    .ilike('nombre', 'Bebidas')
    .limit(1)
    .maybeSingle();
  if (cat) {
    categoriaId = cat.id;
  } else {
    const { data: nueva } = await admin
      .from('categorias')
      .insert({ empresa_id: empresaId, nombre: 'Bebidas', color: '#0ea5e9' })
      .select('id')
      .single();
    categoriaId = nueva?.id ?? null;
  }

  const { error } = await admin.from('productos').insert({
    empresa_id: empresaId,
    nombre: insumo.nombre,
    categoria_id: categoriaId,
    precio_compra: Number(insumo.costo_unitario) || 0,
    precio_venta: precio,
    stock_actual: Math.floor(Number(insumo.stock_actual) || 0),
    stock_minimo: 0,
    activo: true,
    variantes: [],
    insumo_id: insumoId,
  });
  if (error) {
    return { ok: false, error: 'No se pudo crear el producto. ¿Corriste la migración 012?' };
  }

  refrescar();
  return { ok: true };
}

export async function actualizarInsumo(
  id: string,
  _prev: InsumoState,
  formData: FormData,
): Promise<InsumoState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = insumoSchema.safeParse({
    nombre: formData.get('nombre'),
    tipo: formData.get('tipo') ?? 'materia_prima',
    unidad: formData.get('unidad'),
    stock_actual: formData.get('stock_actual') ?? '0',
    stock_minimo: formData.get('stock_minimo') ?? '0',
    costo_unitario: formData.get('costo_unitario') ?? '0',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = parsed.data;

  // El stock se cambia con "Agregar" o "Ajustar", no aquí.
  const admin = createAdminClient();

  // No permitir cambiar la unidad si hay stock o recetas: reescalaría los
  // números en silencio (2000 g pasarían a interpretarse como 2000 kg).
  const { data: actual } = await admin
    .from('insumos')
    .select('unidad, stock_actual')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (actual && (actual.unidad as string) !== d.unidad) {
    if ((Number(actual.stock_actual) || 0) > 0) {
      return { error: 'No puedes cambiar la unidad de un ítem con stock. Déjalo en 0 (Ajustar) primero, o crea uno nuevo.' };
    }
    const { count } = await admin
      .from('producto_receta')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('insumo_id', id);
    if ((count ?? 0) > 0) {
      return { error: 'No puedes cambiar la unidad de un ítem usado en recetas. Quítalo de las recetas primero.' };
    }
  }

  const { error } = await admin
    .from('insumos')
    .update({
      nombre: d.nombre,
      tipo: d.tipo,
      unidad: d.unidad,
      stock_minimo: d.stock_minimo,
      costo_unitario: d.costo_unitario,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) return { error: 'No pudimos actualizar el ingrediente.' };

  refrescar();
  return { ok: true };
}

export async function archivarInsumo(id: string): Promise<void> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return;
  const admin = createAdminClient();
  await admin
    .from('insumos')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', empresaId);
  refrescar();
}

/** Agregar stock (compra). Convierte desde la unidad comprada a la del insumo. */
export async function agregarStock(_prev: InsumoState, formData: FormData): Promise<InsumoState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = agregarStockSchema.safeParse({
    insumo_id: formData.get('insumo_id'),
    cantidad: formData.get('cantidad'),
    unidad: formData.get('unidad'),
    costo_total: formData.get('costo_total') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: insumo } = await admin
    .from('insumos')
    .select('stock_actual, costo_unitario, unidad')
    .eq('id', d.insumo_id)
    .eq('empresa_id', empresaId)
    .single();
  if (!insumo) return { error: 'Ingrediente no encontrado' };

  // Convertir la cantidad comprada a la unidad base del insumo.
  const cantidadEnBase = convertir(d.cantidad, d.unidad, insumo.unidad as string);
  if (cantidadEnBase === null) {
    return { error: `No se puede convertir ${d.unidad} a ${insumo.unidad}. Usa una unidad compatible.` };
  }

  const stockAnterior = Number(insumo.stock_actual) || 0;
  const stockNuevo = stockAnterior + cantidadEnBase;

  // Costo promedio ponderado si dieron el costo de la compra.
  let costoUnitario = Number(insumo.costo_unitario) || 0;
  if (d.costo_total && cantidadEnBase > 0) {
    const costoCompraUnit = d.costo_total / cantidadEnBase;
    costoUnitario =
      stockNuevo > 0
        ? (stockAnterior * costoUnitario + cantidadEnBase * costoCompraUnit) / stockNuevo
        : costoCompraUnit;
  }

  await admin
    .from('insumos')
    .update({
      stock_actual: stockNuevo,
      costo_unitario: costoUnitario,
      updated_at: new Date().toISOString(),
    })
    .eq('id', d.insumo_id)
    .eq('empresa_id', empresaId);

  await admin.from('movimientos_insumos').insert({
    empresa_id: empresaId,
    insumo_id: d.insumo_id,
    tipo: 'entrada',
    cantidad: cantidadEnBase,
    referencia_tipo: 'compra',
    notas: `Compra de ${d.cantidad} ${d.unidad}`,
  });

  refrescar();
  return { ok: true };
}

/** Ajuste manual (merma/corrección): fija el nuevo stock. */
export async function ajustarStock(_prev: InsumoState, formData: FormData): Promise<InsumoState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = ajusteStockSchema.safeParse({
    insumo_id: formData.get('insumo_id'),
    nuevo_stock: formData.get('nuevo_stock'),
    motivo: formData.get('motivo') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: insumo } = await admin
    .from('insumos')
    .select('stock_actual')
    .eq('id', d.insumo_id)
    .eq('empresa_id', empresaId)
    .single();
  if (!insumo) return { error: 'Ingrediente no encontrado' };

  const anterior = Number(insumo.stock_actual) || 0;
  const diferencia = d.nuevo_stock - anterior;

  await admin
    .from('insumos')
    .update({ stock_actual: d.nuevo_stock, updated_at: new Date().toISOString() })
    .eq('id', d.insumo_id)
    .eq('empresa_id', empresaId);

  await admin.from('movimientos_insumos').insert({
    empresa_id: empresaId,
    insumo_id: d.insumo_id,
    tipo: 'ajuste',
    cantidad: Math.abs(diferencia),
    referencia_tipo: 'ajuste',
    notas: d.motivo ? `Ajuste: ${d.motivo}` : 'Ajuste manual',
  });

  refrescar();
  return { ok: true };
}

// ── Fase 2: sumar al inventario los ingredientes leídos de una factura ──

export type LineaCompra = {
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_total?: number | null;
  /** Si se vincula a un insumo existente; si es null/undefined se crea uno nuevo. */
  insumo_id?: string | null;
};

export async function procesarCompraIngredientes(
  lineas: LineaCompra[],
): Promise<{ ok: boolean; agregados?: number; error?: string }> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { ok: false, error: 'No autenticado' };
  if (!Array.isArray(lineas) || lineas.length === 0) return { ok: true, agregados: 0 };

  const admin = createAdminClient();
  let agregados = 0;

  for (const l of lineas) {
    const nombre = (l.nombre ?? '').trim();
    const cantidad = Number(l.cantidad) || 0;
    if (!nombre || cantidad <= 0) continue;
    const unidad = UNIDAD_VALUES.includes(l.unidad) ? l.unidad : 'unidad';
    const costoTotal = l.costo_total != null && l.costo_total > 0 ? Number(l.costo_total) : null;

    if (l.insumo_id) {
      // Vincular a un insumo existente: convertir y sumar.
      const { data: insumo } = await admin
        .from('insumos')
        .select('stock_actual, costo_unitario, unidad')
        .eq('id', l.insumo_id)
        .eq('empresa_id', empresaId)
        .single();
      if (!insumo) continue;
      const cantBase = convertir(cantidad, unidad, insumo.unidad as string);
      if (cantBase === null) continue; // unidad incompatible, saltar esta línea

      const stockAnterior = Number(insumo.stock_actual) || 0;
      const stockNuevo = stockAnterior + cantBase;
      let costoUnitario = Number(insumo.costo_unitario) || 0;
      if (costoTotal && cantBase > 0) {
        const costoCompraUnit = costoTotal / cantBase;
        costoUnitario =
          stockNuevo > 0
            ? (stockAnterior * costoUnitario + cantBase * costoCompraUnit) / stockNuevo
            : costoCompraUnit;
      }
      await admin
        .from('insumos')
        .update({ stock_actual: stockNuevo, costo_unitario: costoUnitario, updated_at: new Date().toISOString() })
        .eq('id', l.insumo_id)
        .eq('empresa_id', empresaId);
      await admin.from('movimientos_insumos').insert({
        empresa_id: empresaId,
        insumo_id: l.insumo_id,
        tipo: 'entrada',
        cantidad: cantBase,
        referencia_tipo: 'compra',
        notas: `Compra (factura): ${cantidad} ${unidad}`,
      });
      agregados++;
    } else {
      // Crear un insumo nuevo con el stock comprado.
      const costoUnitario = costoTotal && cantidad > 0 ? costoTotal / cantidad : 0;
      const { data: nuevo } = await admin
        .from('insumos')
        .insert({
          empresa_id: empresaId,
          nombre,
          unidad,
          stock_actual: cantidad,
          stock_minimo: 0,
          costo_unitario: costoUnitario,
        })
        .select('id')
        .single();
      if (nuevo) {
        await admin.from('movimientos_insumos').insert({
          empresa_id: empresaId,
          insumo_id: nuevo.id,
          tipo: 'entrada',
          cantidad,
          referencia_tipo: 'compra',
          notas: 'Alta desde factura',
        });
        agregados++;
      }
    }
  }

  refrescar();
  return { ok: true, agregados };
}

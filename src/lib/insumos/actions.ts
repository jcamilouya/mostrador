'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { insumoSchema, agregarStockSchema, ajusteStockSchema } from './schemas';
import { convertir } from './units';

export type InsumoState = { ok?: boolean; error?: string };

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

function refrescar() {
  revalidatePath('/dashboard/insumos');
  revalidatePath('/dashboard');
}

export async function crearInsumo(_prev: InsumoState, formData: FormData): Promise<InsumoState> {
  const empresaId = await requireEmpresaId();
  if (!empresaId) return { error: 'No autenticado' };

  const parsed = insumoSchema.safeParse({
    nombre: formData.get('nombre'),
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
    unidad: formData.get('unidad'),
    stock_actual: formData.get('stock_actual') ?? '0',
    stock_minimo: formData.get('stock_minimo') ?? '0',
    costo_unitario: formData.get('costo_unitario') ?? '0',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = parsed.data;

  // El stock se cambia con "Agregar" o "Ajustar", no aquí.
  const admin = createAdminClient();
  const { error } = await admin
    .from('insumos')
    .update({
      nombre: d.nombre,
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

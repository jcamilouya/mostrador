'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanInfo } from '@/lib/plan/queries';
import {
  costosDeReceta,
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  descontarStockProductosPorVenta,
} from '@/lib/insumos/consumo';
import { normalizarVariantes } from '@/lib/inventario/queries';

export type CuentaResult =
  | { ok: true; ventaId: string; numero: number; total: number }
  | { ok: false; error: string };

const itemSchema = z.object({
  producto_id: z.uuid(),
  cantidad: z.number().int().positive(),
  nombre: z.string().min(1),
  variante: z.string().max(80).nullable().optional(),
  insumo_extra_id: z.uuid().nullable().optional(),
});

const cuentaSchema = z.object({
  /** Si viene, se actualiza esa cuenta; si no, se abre una nueva. */
  venta_id: z.uuid().optional().nullable(),
  mesa: z.string().min(1, { error: 'Ponle un nombre a la cuenta' }).max(60),
  items: z.array(itemSchema).min(1, { error: 'Agrega al menos un producto' }),
  cliente_id: z.uuid().optional().nullable(),
  notas: z.string().max(500).optional(),
});

type Contexto = { empresaId: string; admin: ReturnType<typeof createAdminClient> };

async function contexto(): Promise<Contexto | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) return null;
  return { empresaId: usuario.empresa_id, admin: createAdminClient() };
}

/**
 * Resuelve precios y costos SERVER-SIDE, igual que una venta normal: el
 * navegador nunca decide cuánto cuesta algo.
 */
async function resolverLineas(
  { empresaId, admin }: Contexto,
  items: z.infer<typeof itemSchema>[],
) {
  const ids = [...new Set(items.map((i) => i.producto_id))];
  const { data: prods } = await admin
    .from('productos')
    .select('id, precio_venta, precio_compra, variantes')
    .eq('empresa_id', empresaId)
    .in('id', ids);
  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]));
  const costos = await costosDeReceta(admin, empresaId, ids);

  return items.map((i) => {
    const p = prodMap.get(i.producto_id);
    let precioUnitario = 0;
    let precioCompra = 0;
    if (p) {
      precioUnitario = Number(p.precio_venta) || 0;
      precioCompra = Number(p.precio_compra) || 0;
      const costoReceta = costos.get(i.producto_id) ?? 0;
      if (costoReceta > 0) precioCompra = costoReceta;
      if (i.variante) {
        const v = normalizarVariantes(p.variantes).find((x) => x.nombre === i.variante);
        if (v) precioUnitario = v.precio;
      }
    }
    return { ...i, precio_unitario: precioUnitario, precio_compra: precioCompra };
  });
}

/** Reemplaza las líneas de una cuenta por las que llegan del carrito. */
async function guardarLineas(
  { admin }: Contexto,
  ventaId: string,
  lineas: Awaited<ReturnType<typeof resolverLineas>>,
): Promise<string | null> {
  await admin.from('venta_items').delete().eq('venta_id', ventaId);

  const usaBebidas = lineas.some((i) => i.insumo_extra_id);
  const filas = lineas.map((i) => ({
    venta_id: ventaId,
    producto_id: i.producto_id,
    nombre_producto: i.nombre,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    precio_compra: i.precio_compra,
    subtotal: i.cantidad * i.precio_unitario,
    ...(usaBebidas ? { insumo_extra_id: i.insumo_extra_id ?? null } : {}),
  }));
  const { error } = await admin.from('venta_items').insert(filas);
  return error ? error.message : null;
}

function refrescar() {
  revalidatePath('/dashboard/mesas');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard');
}

/**
 * Abre una cuenta nueva o actualiza una existente. NO descuenta inventario ni
 * cuenta como ingreso: eso pasa solo al cobrarla.
 */
export async function guardarCuenta(input: unknown): Promise<CuentaResult> {
  const parsed = cuentaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const plan = await getPlanInfo(ctx.empresaId);
  if (plan.bloqueado) {
    return { ok: false, error: 'Tu prueba gratis terminó. Mejora tu plan para seguir vendiendo.' };
  }

  const lineas = await resolverLineas(ctx, parsed.data.items);
  const total = lineas.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);

  // Actualizar una cuenta que ya estaba abierta
  if (parsed.data.venta_id) {
    const { data: existente } = await ctx.admin
      .from('ventas')
      .select('id, numero_venta, estado')
      .eq('id', parsed.data.venta_id)
      .eq('empresa_id', ctx.empresaId)
      .maybeSingle();
    if (!existente) return { ok: false, error: 'Esa cuenta ya no existe' };
    if (existente.estado !== 'abierta') {
      return { ok: false, error: 'Esa cuenta ya fue cobrada o anulada' };
    }

    const err = await guardarLineas(ctx, existente.id, lineas);
    if (err) return { ok: false, error: `No se pudieron guardar los productos: ${err}` };

    await ctx.admin
      .from('ventas')
      .update({
        mesa: parsed.data.mesa,
        subtotal: total,
        total,
        cliente_id: parsed.data.cliente_id ?? null,
        notas: parsed.data.notas ?? null,
      })
      .eq('id', existente.id)
      .eq('empresa_id', ctx.empresaId);

    refrescar();
    return { ok: true, ventaId: existente.id, numero: existente.numero_venta, total };
  }

  // Abrir una cuenta nueva
  const insert: Record<string, unknown> = {
    empresa_id: ctx.empresaId,
    subtotal: total,
    iva: 0,
    total,
    metodo_pago: 'efectivo', // se decide al cobrar; la columna no admite null
    estado: 'abierta',
    mesa: parsed.data.mesa,
    notas: parsed.data.notas ?? null,
  };
  if (parsed.data.cliente_id) insert.cliente_id = parsed.data.cliente_id;

  const { data: venta, error } = await ctx.admin
    .from('ventas')
    .insert(insert)
    .select('id, numero_venta')
    .single();

  if (error || !venta) {
    // Sin la migración 014 la BD rechaza el estado 'abierta' o la columna mesa.
    if (error?.code === '23514' || error?.code === '42703') {
      return {
        ok: false,
        error: 'Para usar mesas falta correr la migración 014 en Supabase.',
      };
    }
    return { ok: false, error: 'No pudimos abrir la cuenta. Intenta de nuevo.' };
  }

  const err = await guardarLineas(ctx, venta.id, lineas);
  if (err) {
    await ctx.admin.from('ventas').delete().eq('id', venta.id);
    return { ok: false, error: `No se pudieron guardar los productos: ${err}` };
  }

  refrescar();
  return { ok: true, ventaId: venta.id, numero: venta.numero_venta, total };
}

const cobroSchema = z.object({
  venta_id: z.uuid(),
  metodo_pago: z.enum(['efectivo', 'breb', 'transferencia', 'mixto', 'tarjeta']),
  items: z.array(itemSchema).min(1),
  mesa: z.string().max(60).optional(),
  cliente_id: z.uuid().optional().nullable(),
});

/**
 * Cierra una cuenta abierta: guarda las líneas finales, la marca completada y
 * AHÍ SÍ descuenta inventario (productos, ingredientes y bebidas), igual que
 * una venta normal. Reusa la misma fila de `ventas`, así que no se duplica.
 */
export async function cobrarCuenta(input: unknown): Promise<CuentaResult> {
  const parsed = cobroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const { data: venta } = await ctx.admin
    .from('ventas')
    .select('id, numero_venta, estado')
    .eq('id', parsed.data.venta_id)
    .eq('empresa_id', ctx.empresaId)
    .maybeSingle();
  if (!venta) return { ok: false, error: 'Esa cuenta ya no existe' };
  if (venta.estado !== 'abierta') {
    return { ok: false, error: 'Esa cuenta ya fue cobrada o anulada' };
  }

  const lineas = await resolverLineas(ctx, parsed.data.items);
  const subtotal = lineas.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);

  let recargo = 0;
  if (parsed.data.metodo_pago === 'tarjeta') {
    const { data: emp } = await ctx.admin
      .from('empresas')
      .select('recargo_tarjeta_pct')
      .eq('id', ctx.empresaId)
      .maybeSingle();
    const pct = Number((emp as Record<string, unknown> | null)?.recargo_tarjeta_pct) || 0;
    if (pct > 0) recargo = Math.round((subtotal * pct) / 100);
  }
  const total = subtotal + recargo;

  const err = await guardarLineas(ctx, venta.id, lineas);
  if (err) return { ok: false, error: `No se pudieron guardar los productos: ${err}` };

  const cambios: Record<string, unknown> = {
    estado: 'completada',
    metodo_pago: parsed.data.metodo_pago,
    subtotal,
    total,
    recargo,
  };
  if (parsed.data.mesa) cambios.mesa = parsed.data.mesa;

  // Solo cierra si SIGUE abierta: si otro mesero la cobró primero, no se
  // descuenta el inventario dos veces.
  let { data: cerradas, error: updErr } = await ctx.admin
    .from('ventas')
    .update(cambios)
    .eq('id', venta.id)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');

  if (updErr?.code === '42703') {
    delete cambios.recargo;
    ({ data: cerradas, error: updErr } = await ctx.admin
      .from('ventas')
      .update(cambios)
      .eq('id', venta.id)
      .eq('empresa_id', ctx.empresaId)
      .eq('estado', 'abierta')
      .select('id'));
  }
  if (updErr) return { ok: false, error: 'No pudimos cerrar la cuenta.' };
  if (!cerradas || cerradas.length === 0) {
    return { ok: false, error: 'Esa cuenta la acaban de cobrar desde otro lado.' };
  }

  const paraStock = lineas.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
  await descontarStockProductosPorVenta(ctx.admin, ctx.empresaId, venta.id, venta.numero_venta, paraStock);
  await descontarIngredientesPorVenta(ctx.admin, ctx.empresaId, venta.id, venta.numero_venta, paraStock);
  await descontarInsumosVendidos(
    ctx.admin,
    ctx.empresaId,
    venta.id,
    venta.numero_venta,
    lineas
      .filter((i) => i.insumo_extra_id)
      .map((i) => ({ insumo_id: i.insumo_extra_id as string, cantidad: i.cantidad })),
  );

  refrescar();
  revalidatePath('/dashboard/ingresos');
  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/insumos');
  return { ok: true, ventaId: venta.id, numero: venta.numero_venta, total };
}

/** Anula una cuenta abierta. No toca inventario: nunca lo había descontado. */
export async function anularCuenta(ventaId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const { data: cerradas, error } = await ctx.admin
    .from('ventas')
    .update({ estado: 'cancelada' })
    .eq('id', ventaId)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');

  if (error) return { ok: false, error: 'No pudimos anular la cuenta.' };
  if (!cerradas || cerradas.length === 0) {
    return { ok: false, error: 'Esa cuenta ya no estaba abierta.' };
  }

  refrescar();
  return { ok: true };
}

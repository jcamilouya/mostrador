'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { faltaColumna } from '@/lib/supabase/errores';
import { getPlanInfo } from '@/lib/plan/queries';
import {
  costosDeReceta,
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  descontarStockProductosPorVenta,
} from '@/lib/insumos/consumo';
import { normalizarVariantes } from '@/lib/inventario/queries';
import { CUENTA_CAMBIO, huellaCuenta, type LineaHuella } from './huella';

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
  /** Mesa del plano (migración 021). Si viene, la etiqueta sale de su nombre. */
  mesa_id: z.uuid().optional().nullable(),
  /** Cómo estaba la cuenta al cargarla (ver `huella.ts`). */
  huella: z.string().max(50000).optional().nullable(),
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

/**
 * Reemplaza las líneas de una cuenta por las que llegan del carrito.
 *
 * Primero inserta las nuevas y DESPUÉS borra las viejas (por id). Antes era al
 * revés: si el insert fallaba (internet, una columna), la cuenta quedaba sin
 * ningún plato y la mesa se "perdía".
 */
async function guardarLineas(
  { admin }: Contexto,
  ventaId: string,
  lineas: Awaited<ReturnType<typeof resolverLineas>>,
): Promise<string | null> {
  const { data: viejas } = await admin.from('venta_items').select('id').eq('venta_id', ventaId);

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
  if (error) return error.message;

  const ids = (viejas ?? []).map((v) => v.id as string);
  if (ids.length > 0) {
    const { error: delErr } = await admin.from('venta_items').delete().in('id', ids);
    if (delErr) return delErr.message;
  }
  return null;
}

/**
 * La mesa del plano a la que va la cuenta, validada contra ESTA empresa.
 * Devuelve su nombre (la etiqueta de la cuenta) o un error para el usuario.
 */
async function mesaDelPlano(
  { empresaId, admin }: Contexto,
  mesaId: string,
): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('salon_piezas')
    .select('id, nombre, tipo')
    .eq('id', mesaId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error || !data || data.tipo !== 'mesa') {
    return { ok: false, error: 'Esa mesa ya no está en el plano. Vuelve a Mesas.' };
  }
  return { ok: true, nombre: data.nombre as string };
}

/**
 * ¿La cuenta sigue como estaba cuando la abrieron en el POS? Si otro equipo le
 * agregó o quitó algo, guardar/cobrar con la copia vieja borraría ese cambio:
 * se rechaza. Sin huella (clientes viejos) no se verifica.
 */
async function cuentaSinCambios(
  { admin }: Contexto,
  ventaId: string,
  huella: string | null | undefined,
): Promise<boolean> {
  if (huella == null) return true;
  const { data, error } = await admin
    .from('venta_items')
    .select('producto_id, nombre_producto, cantidad, precio_unitario')
    .eq('venta_id', ventaId);
  if (error || !data) return true; // no bloquear la caja por no poder leer
  return huellaCuenta(data as LineaHuella[]) === huella;
}

/** Mensaje cuando la base rechaza una segunda cuenta en la misma mesa. */
function mesaOcupada(nombre: string): string {
  return `${nombre} ya tiene una cuenta abierta (la acaban de abrir desde otro lado). Vuelve a Mesas y agrégale ahí.`;
}

/** Sentaron gente en la mesa: su reserva ya se cumplió. */
async function cumplirReserva({ empresaId, admin }: Contexto, mesaId: string) {
  await admin
    .from('salon_piezas')
    .update({ reserva_nombre: null, reserva_en: null, reserva_personas: null })
    .eq('id', mesaId)
    .eq('empresa_id', empresaId);
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

  // Mesa del plano: la etiqueta es SU nombre, no lo que mande el navegador.
  const mesaId = parsed.data.mesa_id ?? null;
  let etiqueta = parsed.data.mesa;
  if (mesaId) {
    const m = await mesaDelPlano(ctx, mesaId);
    if (!m.ok) return { ok: false, error: m.error };
    etiqueta = m.nombre;
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
    if (!(await cuentaSinCambios(ctx, existente.id, parsed.data.huella))) {
      return { ok: false, error: CUENTA_CAMBIO };
    }

    // Primero la cabecera, y SOLO si sigue abierta: si la acaban de cobrar
    // desde la caja, no se le cambian los platos a una venta ya cerrada.
    const cambios: Record<string, unknown> = {
      mesa: etiqueta,
      subtotal: total,
      total,
      cliente_id: parsed.data.cliente_id ?? null,
      notas: parsed.data.notas ?? null,
    };
    if (mesaId) cambios.mesa_id = mesaId;
    const actualizar = () =>
      ctx.admin
        .from('ventas')
        .update(cambios)
        .eq('id', existente.id)
        .eq('empresa_id', ctx.empresaId)
        .eq('estado', 'abierta')
        .select('id');
    let { data: siguen, error: updErr } = await actualizar();
    if (faltaColumna(updErr) && mesaId) {
      delete cambios.mesa_id;
      ({ data: siguen, error: updErr } = await actualizar());
    }
    if (updErr?.code === '23505') return { ok: false, error: mesaOcupada(etiqueta) };
    if (updErr) return { ok: false, error: 'No pudimos guardar la cuenta. Intenta de nuevo.' };
    if (!siguen || siguen.length === 0) {
      return { ok: false, error: 'Esa cuenta la acaban de cobrar o anular desde otro lado.' };
    }

    const err = await guardarLineas(ctx, existente.id, lineas);
    if (err) return { ok: false, error: `No se pudieron guardar los productos: ${err}` };

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
    mesa: etiqueta,
    notas: parsed.data.notas ?? null,
  };
  if (parsed.data.cliente_id) insert.cliente_id = parsed.data.cliente_id;
  if (mesaId) insert.mesa_id = mesaId;

  const abrir = () =>
    ctx.admin.from('ventas').insert(insert).select('id, numero_venta').single();
  let { data: venta, error } = await abrir();
  if (faltaColumna(error) && mesaId) {
    delete insert.mesa_id;
    ({ data: venta, error } = await abrir());
  }

  // El índice único de la 021: esa mesa ya tiene cuenta abierta.
  if (error?.code === '23505') return { ok: false, error: mesaOcupada(etiqueta) };

  if (error || !venta) {
    // Sin la migración 014 la BD rechaza el estado 'abierta' o la columna mesa.
    if (error?.code === '23514' || faltaColumna(error)) {
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
  if (mesaId) await cumplirReserva(ctx, mesaId);

  refrescar();
  return { ok: true, ventaId: venta.id, numero: venta.numero_venta, total };
}

const cobroSchema = z.object({
  venta_id: z.uuid(),
  metodo_pago: z.enum(['efectivo', 'breb', 'transferencia', 'mixto', 'tarjeta']),
  items: z.array(itemSchema).min(1),
  mesa: z.string().max(60).optional(),
  cliente_id: z.uuid().optional().nullable(),
  huella: z.string().max(50000).optional().nullable(),
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
    .select('id, numero_venta, estado, cliente_id, subtotal, total')
    .eq('id', parsed.data.venta_id)
    .eq('empresa_id', ctx.empresaId)
    .maybeSingle();
  if (!venta) return { ok: false, error: 'Esa cuenta ya no existe' };
  if (venta.estado !== 'abierta') {
    return { ok: false, error: 'Esa cuenta ya fue cobrada o anulada' };
  }
  if (!(await cuentaSinCambios(ctx, venta.id, parsed.data.huella))) {
    return { ok: false, error: CUENTA_CAMBIO };
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

  const cambios: Record<string, unknown> = {
    estado: 'completada',
    metodo_pago: parsed.data.metodo_pago,
    subtotal,
    total,
    recargo,
  };
  if (parsed.data.mesa) cambios.mesa = parsed.data.mesa;
  if (parsed.data.cliente_id) cambios.cliente_id = parsed.data.cliente_id;

  // PRIMERO se reclama la cuenta: solo cierra si SIGUE abierta. Si la caja y
  // el mesero cobran a la vez, uno gana y el otro recibe "ya la cobraron" sin
  // haber tocado nada. (Antes los platos se reescribían ANTES de este filtro,
  // y el que perdía dejaba sus platos en la venta que había cobrado el otro.)
  let { data: cerradas, error: updErr } = await ctx.admin
    .from('ventas')
    .update(cambios)
    .eq('id', venta.id)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');

  if (faltaColumna(updErr)) {
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

  // Ya es nuestra: ahora sí los platos finales. Si fallan, la cuenta vuelve a
  // abierta tal como estaba (todavía no se descontó nada del inventario).
  const err = await guardarLineas(ctx, venta.id, lineas);
  if (err) {
    await ctx.admin
      .from('ventas')
      .update({ estado: 'abierta', subtotal: venta.subtotal, total: venta.total })
      .eq('id', venta.id)
      .eq('empresa_id', ctx.empresaId);
    return { ok: false, error: `No se pudieron guardar los productos: ${err}` };
  }

  // Acumular la compra del cliente, igual que una venta normal. Si esto no
  // estuviera, cobrar por mesa no le sumaría nada a su historial.
  const clienteId =
    parsed.data.cliente_id ?? ((venta as Record<string, unknown>).cliente_id as string | null);
  if (clienteId) {
    const { data: cli } = await ctx.admin
      .from('clientes')
      .select('total_compras, cantidad_compras')
      .eq('id', clienteId)
      .eq('empresa_id', ctx.empresaId)
      .maybeSingle();
    if (cli) {
      await ctx.admin
        .from('clientes')
        .update({
          total_compras: (Number(cli.total_compras) || 0) + total,
          cantidad_compras: (Number(cli.cantidad_compras) || 0) + 1,
          ultima_compra: new Date().toISOString(),
        })
        .eq('id', clienteId)
        .eq('empresa_id', ctx.empresaId);
    }
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

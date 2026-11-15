'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { faltaColumna, nombreColumnaFaltante } from '@/lib/supabase/errores';
import { getPlanInfo } from '@/lib/plan/queries';
import { exigir } from '@/lib/auth/actor';
import type { Permiso } from '@/lib/auth/roles';
import {
  costosDeReceta,
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  descontarStockProductosPorVenta,
} from '@/lib/insumos/consumo';
import { normalizarVariantes } from '@/lib/inventario/queries';
import { crearComanda, marcharPendientes, type ItemComanda } from '@/lib/comandas/crear';
import { CUENTA_CAMBIO, huellaCuenta, type LineaHuella } from './huella';

export type CuentaResult =
  | {
      ok: true;
      ventaId: string;
      numero: number;
      total: number;
      /** Número de la comanda que salió a cocina, si se marchó algo. */
      comanda?: number | null;
      /** Se guardó, pero algo de cocina no salió (para avisar sin perder la cuenta). */
      aviso?: string;
    }
  | { ok: false; error: string };

const itemSchema = z.object({
  producto_id: z.uuid(),
  cantidad: z.number().int().positive(),
  nombre: z.string().min(1),
  variante: z.string().max(80).nullable().optional(),
  insumo_extra_id: z.uuid().nullable().optional(),
  /** "Sin cebolla", "término medio"… sale en la comanda. */
  nota: z.string().trim().max(140).nullable().optional(),
});

const domicilioSchema = z.object({
  nombre: z.string().trim().min(1, { error: '¿A nombre de quién va el domicilio?' }).max(60),
  telefono: z
    .string()
    .transform((t) => t.replace(/[^\d+]/g, ''))
    .pipe(z.string().regex(/^\+?\d{7,15}$/, { error: 'Revisa el celular del domicilio' })),
  direccion: z.string().trim().min(4, { error: 'Falta la dirección del domicilio' }).max(160),
  canal: z.enum(['llamada', 'whatsapp']),
  pago: z.enum(['efectivo', 'tarjeta', 'breb', 'transferencia']),
  nota: z.string().trim().max(200).optional().nullable(),
});
export type DatosDomicilio = z.infer<typeof domicilioSchema>;

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
  /** Además de guardar, mandar a cocina lo que falta (botón "Marchar"). */
  marchar: z.boolean().optional(),
  tipo_pedido: z.enum(['mesa', 'llevar', 'domicilio']).optional().nullable(),
  domicilio: domicilioSchema.optional().nullable(),
});

type Contexto = {
  empresaId: string;
  admin: ReturnType<typeof createAdminClient>;
  /** Quién lo hizo: sale en la comanda ("Carlos"). */
  nombre: string;
};

/** Sesión + permiso del rol (023), leído de la base. */
async function contexto(permiso: Permiso): Promise<{ ok: true; ctx: Contexto } | { ok: false; error: string }> {
  const q = await exigir(permiso);
  if (!q.ok) return q;
  return {
    ok: true,
    ctx: { empresaId: q.actor.empresaId, admin: createAdminClient(), nombre: q.actor.nombre },
  };
}

/**
 * Resuelve precios y costos SERVER-SIDE, igual que una venta normal: el
 * navegador nunca decide cuánto cuesta algo.
 */
async function resolverLineas({ empresaId, admin }: Contexto, items: z.infer<typeof itemSchema>[]) {
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
    return { ...i, nota: i.nota || null, precio_unitario: precioUnitario, precio_compra: precioCompra };
  });
}
type Linea = Awaited<ReturnType<typeof resolverLineas>>[number];

const claveLinea = (productoId: string | null, nombre: string, nota: string | null) =>
  `${productoId ?? ''}\u0001${nombre}\u0001${nota ?? ''}`;

/**
 * Reemplaza las líneas de una cuenta por las que llegan del carrito,
 * CONSERVANDO lo que ya está en cocina.
 *
 *  - Primero inserta las nuevas y DESPUÉS borra las viejas (por id): un insert
 *    fallido ya no deja la mesa sin platos.
 *  - Lo marchado no se pierde al reescribir: de cada plato, hasta la cantidad
 *    que ya estaba en cocina queda marchada (con su hora) y el resto queda
 *    "sin marchar". Por eso una línea puede quedar en DOS filas.
 *  - Si bajaron la cantidad de algo que ya estaba en cocina, devuelve esos
 *    `anulados` para avisarle a cocina.
 *
 * Sin la migración 023 (no hay `marchado_en`/`nota`), guarda como antes.
 */
async function guardarLineas(
  { admin }: Contexto,
  ventaId: string,
  lineas: Linea[],
): Promise<{ error: string | null; anulados: ItemComanda[] }> {
  let conMarcha = true;
  let res = await admin
    .from('venta_items')
    .select('id, producto_id, nombre_producto, cantidad, nota, marchado_en')
    .eq('venta_id', ventaId);
  if (faltaColumna(res.error)) {
    conMarcha = false;
    res = (await admin.from('venta_items').select('id').eq('venta_id', ventaId)) as typeof res;
  }
  const viejas = (res.data ?? []) as Record<string, unknown>[];

  // Lo que ya está en cocina, por plato.
  const enCocina = new Map<string, { cantidad: number; en: string; nombre: string; nota: string | null }>();
  if (conMarcha) {
    for (const v of viejas) {
      if (!v.marchado_en) continue;
      const k = claveLinea(v.producto_id as string | null, v.nombre_producto as string, (v.nota as string | null) ?? null);
      const ya = enCocina.get(k);
      const en = v.marchado_en as string;
      enCocina.set(k, {
        cantidad: (ya?.cantidad ?? 0) + (Number(v.cantidad) || 0),
        en: ya && ya.en < en ? ya.en : en,
        nombre: v.nombre_producto as string,
        nota: (v.nota as string | null) ?? null,
      });
    }
  }

  // Las nuevas, juntando las repetidas.
  const nuevas = new Map<string, Linea>();
  for (const l of lineas) {
    const k = claveLinea(l.producto_id, l.nombre, conMarcha ? l.nota : null);
    const ya = nuevas.get(k);
    nuevas.set(k, ya ? { ...ya, cantidad: ya.cantidad + l.cantidad } : l);
  }

  const usaBebidas = lineas.some((i) => i.insumo_extra_id);
  const filas: Record<string, unknown>[] = [];
  for (const [k, l] of nuevas) {
    const base: Record<string, unknown> = {
      venta_id: ventaId,
      producto_id: l.producto_id,
      nombre_producto: l.nombre,
      precio_unitario: l.precio_unitario,
      precio_compra: l.precio_compra,
      ...(usaBebidas ? { insumo_extra_id: l.insumo_extra_id ?? null } : {}),
      ...(conMarcha ? { nota: l.nota } : {}),
    };
    const cocina = enCocina.get(k);
    const marchadas = Math.min(l.cantidad, cocina?.cantidad ?? 0);
    if (marchadas > 0) {
      filas.push({ ...base, cantidad: marchadas, subtotal: marchadas * l.precio_unitario, marchado_en: cocina!.en });
    }
    const resto = l.cantidad - marchadas;
    if (resto > 0) {
      filas.push({
        ...base,
        cantidad: resto,
        subtotal: resto * l.precio_unitario,
        ...(conMarcha ? { marchado_en: null } : {}),
      });
    }
  }

  const anulados: ItemComanda[] = [];
  for (const [k, c] of enCocina) {
    const quedan = nuevas.get(k)?.cantidad ?? 0;
    if (quedan < c.cantidad) anulados.push({ cantidad: c.cantidad - quedan, nombre: c.nombre, nota: c.nota });
  }

  const { error } = await admin.from('venta_items').insert(filas);
  if (error) return { error: error.message, anulados: [] };

  const ids = viejas.map((v) => v.id as string);
  if (ids.length > 0) {
    const { error: delErr } = await admin.from('venta_items').delete().in('id', ids);
    if (delErr) return { error: delErr.message, anulados: [] };
  }
  return { error: null, anulados };
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
  revalidatePath('/dashboard/cocina');
  revalidatePath('/dashboard');
}

/** Lo que va debajo del título en la comanda de un domicilio. */
function detalleDomicilio(d: DatosDomicilio | null | undefined): string | null {
  if (!d) return null;
  const pago = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', breb: 'Bre-B', transferencia: 'Transferencia' }[d.pago];
  return [d.direccion, d.telefono, `Paga: ${pago}`, d.nota].filter(Boolean).join(' · ');
}

/**
 * UPDATE/INSERT que suelta, de a una, las columnas que todavía no existen
 * (migraciones sin correr), igual que el registro de negocios.
 */
async function conColumnasOpcionales<T>(
  fila: Record<string, unknown>,
  opcionales: string[],
  hacer: (f: Record<string, unknown>) => PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>,
) {
  let r = await hacer(fila);
  for (let i = 0; r.error && faltaColumna(r.error) && i < opcionales.length; i++) {
    const col = nombreColumnaFaltante(r.error);
    if (!col || !(col in fila) || !opcionales.includes(col)) break;
    delete fila[col];
    r = await hacer(fila);
  }
  return r;
}

/** Después de guardar: avisar a cocina lo anulado y marchar lo nuevo. */
async function cocina(
  ctx: Contexto,
  ventaId: string,
  titulo: string,
  detalle: string | null,
  anulados: ItemComanda[],
  marchar: boolean,
): Promise<{ comanda: number | null; aviso?: string }> {
  if (anulados.length > 0) {
    await crearComanda(ctx.admin, {
      empresaId: ctx.empresaId,
      ventaId,
      tipo: 'anulado',
      titulo,
      detalle,
      items: anulados,
      creadoPor: ctx.nombre,
    });
  }
  if (!marchar) return { comanda: null };
  const m = await marcharPendientes(ctx.admin, {
    empresaId: ctx.empresaId,
    ventaId,
    titulo,
    detalle,
    creadoPor: ctx.nombre,
  });
  return { comanda: m.numero, aviso: m.error };
}

/**
 * Abre una cuenta nueva o actualiza una existente (mesa, para llevar sin
 * pagar o domicilio). NO descuenta inventario ni cuenta como ingreso: eso
 * pasa solo al cobrarla. Con `marchar`, además manda a cocina lo nuevo.
 */
export async function guardarCuenta(input: unknown): Promise<CuentaResult> {
  const q = await contexto('atender');
  if (!q.ok) return q;
  const ctx = q.ctx;
  const parsed = cuentaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const d = parsed.data;

  const plan = await getPlanInfo(ctx.empresaId);
  if (plan.bloqueado) {
    return { ok: false, error: 'Tu prueba gratis terminó. Mejora tu plan para seguir vendiendo.' };
  }

  // Domicilio: sin dirección ni celular no sale.
  if (d.tipo_pedido === 'domicilio' && !d.domicilio) {
    return { ok: false, error: 'Faltan los datos del domicilio.' };
  }

  // Mesa del plano: la etiqueta es SU nombre, no lo que mande el navegador.
  const mesaId = d.mesa_id ?? null;
  let etiqueta = d.mesa;
  if (mesaId) {
    const m = await mesaDelPlano(ctx, mesaId);
    if (!m.ok) return { ok: false, error: m.error };
    etiqueta = m.nombre;
  } else if (d.tipo_pedido === 'domicilio' && d.domicilio) {
    etiqueta = `Domicilio · ${d.domicilio.nombre}`.slice(0, 60);
  }

  const lineas = await resolverLineas(ctx, d.items);
  const total = lineas.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);

  // ── Actualizar una cuenta que ya estaba abierta ──
  if (d.venta_id) {
    const { data: existente } = await ctx.admin
      .from('ventas')
      .select('*')
      .eq('id', d.venta_id)
      .eq('empresa_id', ctx.empresaId)
      .maybeSingle();
    if (!existente) return { ok: false, error: 'Esa cuenta ya no existe' };
    if (existente.estado !== 'abierta') {
      return { ok: false, error: 'Esa cuenta ya fue cobrada o anulada' };
    }
    if (!(await cuentaSinCambios(ctx, existente.id, d.huella))) {
      return { ok: false, error: CUENTA_CAMBIO };
    }

    // Primero la cabecera, y SOLO si sigue abierta: si la acaban de cobrar
    // desde la caja, no se le cambian los platos a una venta ya cerrada.
    const cambios: Record<string, unknown> = {
      mesa: etiqueta,
      subtotal: total,
      total,
      cliente_id: d.cliente_id ?? null,
      notas: d.notas ?? null,
    };
    if (mesaId) cambios.mesa_id = mesaId;
    if (d.domicilio) cambios.domicilio = d.domicilio;
    const { data: siguen, error: updErr } = await conColumnasOpcionales(cambios, ['mesa_id', 'domicilio'], (f) =>
      ctx.admin
        .from('ventas')
        .update(f)
        .eq('id', existente.id)
        .eq('empresa_id', ctx.empresaId)
        .eq('estado', 'abierta')
        .select('id'),
    );
    if (updErr?.code === '23505') return { ok: false, error: mesaOcupada(etiqueta) };
    if (updErr) return { ok: false, error: 'No pudimos guardar la cuenta. Intenta de nuevo.' };
    if (!siguen || siguen.length === 0) {
      return { ok: false, error: 'Esa cuenta la acaban de cobrar o anular desde otro lado.' };
    }

    const g = await guardarLineas(ctx, existente.id, lineas);
    if (g.error) return { ok: false, error: `No se pudieron guardar los productos: ${g.error}` };

    const dom = (d.domicilio ?? (existente as Record<string, unknown>).domicilio) as DatosDomicilio | null;
    const k = await cocina(ctx, existente.id, etiqueta, detalleDomicilio(dom), g.anulados, d.marchar === true);

    refrescar();
    return { ok: true, ventaId: existente.id, numero: existente.numero_venta, total, comanda: k.comanda, aviso: k.aviso };
  }

  // ── Abrir una cuenta nueva ──
  const insert: Record<string, unknown> = {
    empresa_id: ctx.empresaId,
    subtotal: total,
    iva: 0,
    total,
    metodo_pago: d.domicilio?.pago === 'tarjeta' ? 'tarjeta' : 'efectivo', // se decide al cobrar
    estado: 'abierta',
    mesa: etiqueta,
    notas: d.notas ?? null,
  };
  if (d.cliente_id) insert.cliente_id = d.cliente_id;
  if (mesaId) insert.mesa_id = mesaId;
  const tipo = d.tipo_pedido ?? (mesaId ? 'mesa' : null);
  if (tipo) insert.tipo_pedido = tipo;
  if (d.domicilio) {
    insert.domicilio = d.domicilio;
    insert.entrega_estado = 'cocina';
  }

  const { data: venta, error } = await conColumnasOpcionales<{ id: string; numero_venta: number } | null>(
    insert,
    ['mesa_id', 'tipo_pedido', 'domicilio', 'entrega_estado'],
    (f) => ctx.admin.from('ventas').insert(f).select('id, numero_venta').single(),
  );

  // El índice único de la 021: esa mesa ya tiene cuenta abierta.
  if (error?.code === '23505') return { ok: false, error: mesaOcupada(etiqueta) };

  if (error || !venta) {
    // Sin la migración 014 la BD rechaza el estado 'abierta' o la columna mesa.
    if (error?.code === '23514' || faltaColumna(error)) {
      return { ok: false, error: 'Para usar mesas falta correr la migración 014 en Supabase.' };
    }
    return { ok: false, error: 'No pudimos abrir la cuenta. Intenta de nuevo.' };
  }

  const g = await guardarLineas(ctx, venta.id, lineas);
  if (g.error) {
    await ctx.admin.from('ventas').delete().eq('id', venta.id);
    return { ok: false, error: `No se pudieron guardar los productos: ${g.error}` };
  }
  if (mesaId) await cumplirReserva(ctx, mesaId);

  const k = await cocina(ctx, venta.id, etiqueta, detalleDomicilio(d.domicilio), [], d.marchar === true);

  refrescar();
  return { ok: true, ventaId: venta.id, numero: venta.numero_venta, total, comanda: k.comanda, aviso: k.aviso };
}

/**
 * Marchar lo que falte de una cuenta ya guardada (botón "Marchar" del panel
 * de la mesa). Si no hay nada pendiente, no crea comanda.
 */
export async function marcharCuenta(
  ventaId: string,
): Promise<{ ok: true; comanda: number | null } | { ok: false; error: string }> {
  const q = await contexto('atender');
  if (!q.ok) return q;
  const ctx = q.ctx;
  if (!z.uuid().safeParse(ventaId).success) return { ok: false, error: 'Cuenta inválida' };

  const { data: venta } = await ctx.admin
    .from('ventas')
    .select('*')
    .eq('id', ventaId)
    .eq('empresa_id', ctx.empresaId)
    .maybeSingle();
  if (!venta || venta.estado !== 'abierta') return { ok: false, error: 'Esa cuenta ya no está abierta.' };

  const m = await marcharPendientes(ctx.admin, {
    empresaId: ctx.empresaId,
    ventaId,
    titulo: (venta.mesa as string) || `Cuenta #${venta.numero_venta}`,
    detalle: detalleDomicilio((venta as Record<string, unknown>).domicilio as DatosDomicilio | null),
    creadoPor: ctx.nombre,
  });
  if (m.error) return { ok: false, error: m.error };
  refrescar();
  return { ok: true, comanda: m.numero };
}

/** El domicilio salió del local (va en camino). */
export async function domicilioSalio(ventaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const q = await contexto('atender');
  if (!q.ok) return q;
  if (!z.uuid().safeParse(ventaId).success) return { ok: false, error: 'Cuenta inválida' };
  const { data, error } = await q.ctx.admin
    .from('ventas')
    .update({ entrega_estado: 'camino' })
    .eq('id', ventaId)
    .eq('empresa_id', q.ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');
  if (error) return { ok: false, error: 'No pudimos marcarlo.' };
  if (!data || data.length === 0) return { ok: false, error: 'Ese domicilio ya no está abierto.' };
  refrescar();
  return { ok: true };
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
  const q = await contexto('cobrar');
  if (!q.ok) return q;
  const ctx = q.ctx;
  const parsed = cobroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

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
  const { data: cerradas, error: updErr } = await conColumnasOpcionales(cambios, ['recargo'], (f) =>
    ctx.admin
      .from('ventas')
      .update(f)
      .eq('id', venta.id)
      .eq('empresa_id', ctx.empresaId)
      .eq('estado', 'abierta')
      .select('id'),
  );
  if (updErr) return { ok: false, error: 'No pudimos cerrar la cuenta.' };
  if (!cerradas || cerradas.length === 0) {
    return { ok: false, error: 'Esa cuenta la acaban de cobrar desde otro lado.' };
  }

  // Ya es nuestra: ahora sí los platos finales. Si fallan, la cuenta vuelve a
  // abierta tal como estaba (todavía no se descontó nada del inventario).
  const g = await guardarLineas(ctx, venta.id, lineas);
  if (g.error) {
    await ctx.admin
      .from('ventas')
      .update({ estado: 'abierta', subtotal: venta.subtotal, total: venta.total })
      .eq('id', venta.id)
      .eq('empresa_id', ctx.empresaId);
    return { ok: false, error: `No se pudieron guardar los productos: ${g.error}` };
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

/**
 * Anula una cuenta abierta. No toca inventario: nunca lo había descontado. Si
 * algo ya estaba en cocina, sale una comanda ANULADO para que no lo preparen.
 */
export async function anularCuenta(ventaId: string): Promise<{ ok: boolean; error?: string }> {
  const q = await contexto('anular');
  if (!q.ok) return q;
  const ctx = q.ctx;

  const { data: cerradas, error } = await ctx.admin
    .from('ventas')
    .update({ estado: 'cancelada' })
    .eq('id', ventaId)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id, mesa, numero_venta');

  if (error) return { ok: false, error: 'No pudimos anular la cuenta.' };
  if (!cerradas || cerradas.length === 0) {
    return { ok: false, error: 'Esa cuenta ya no estaba abierta.' };
  }

  const { data: enCocina } = await ctx.admin
    .from('venta_items')
    .select('cantidad, nombre_producto, nota, marchado_en')
    .eq('venta_id', ventaId)
    .not('marchado_en', 'is', null);
  if (enCocina && enCocina.length > 0) {
    await crearComanda(ctx.admin, {
      empresaId: ctx.empresaId,
      ventaId,
      tipo: 'anulado',
      titulo: (cerradas[0].mesa as string) || `Cuenta #${cerradas[0].numero_venta}`,
      creadoPor: ctx.nombre,
      items: enCocina.map((i) => ({
        cantidad: Number(i.cantidad) || 0,
        nombre: i.nombre_producto as string,
        nota: (i.nota as string | null) ?? null,
      })),
    });
  }

  refrescar();
  return { ok: true };
}

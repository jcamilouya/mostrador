'use server';

import { negado } from '@/lib/auth/actor';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FORMAS, LIMITES, validarPlano, type Pieza, type Zona } from './modelo';

export type Resultado = { ok: true } | { ok: false; error: string };

type Contexto = { empresaId: string; admin: ReturnType<typeof createAdminClient> };

// NO exportar: en un archivo 'use server' todo lo exportado se vuelve un
// endpoint que el navegador puede llamar.
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

function refrescar() {
  revalidatePath('/dashboard/mesas');
  revalidatePath('/dashboard/pos');
}

const SIN_MIGRACION = 'Para usar el plano falta correr la migración 021 en Supabase.';

function faltaTabla(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

// ── Guardar el plano completo (editor) ──────────────────────────────────────

const nombre = z
  .string()
  .trim()
  .min(1, { error: 'Hay algo sin nombre en el plano' })
  .max(LIMITES.nombre, { error: `Los nombres van hasta ${LIMITES.nombre} letras` });

const zonaSchema = z.object({
  id: z.uuid(),
  nombre,
  cols: z.number().int().min(6).max(40),
  filas: z.number().int().min(4).max(30),
  orden: z.number().int().min(0).max(100),
});

const piezaSchema = z.object({
  id: z.uuid(),
  zona_id: z.uuid(),
  tipo: z.enum(['mesa', 'cocina', 'barra', 'banos', 'entrada', 'caja', 'pared']),
  forma: z.enum(['cuadrada', 'redonda', 'larga', 'butaca']).nullable(),
  nombre,
  puestos: z.number().int().min(1).max(40).nullable(),
  x: z.number().int().min(0).max(40),
  y: z.number().int().min(0).max(30),
  w: z.number().int().min(1).max(LIMITES.ladoPieza),
  h: z.number().int().min(1).max(LIMITES.ladoPieza),
});

const planoSchema = z.object({
  zonas: z.array(zonaSchema).max(LIMITES.zonas),
  piezas: z.array(piezaSchema).max(LIMITES.piezas),
});

/**
 * Guarda el plano entero tal como quedó en el editor: crea lo nuevo, actualiza
 * lo que cambió y borra lo que quitaron. Reglas:
 *  - La geometría se valida AQUÍ con `validarPlano` (nada encimado ni afuera).
 *  - No se puede quitar una mesa que tiene una cuenta abierta.
 *  - Los ids que no son de esta empresa nunca se tocan: lo propio se actualiza,
 *    lo demás solo se INSERTA (si el id ya existe en otro negocio, falla).
 */
export async function guardarPlano(input: unknown): Promise<Resultado> {
  { const neg = await negado('administrar'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  const parsed = planoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'El plano tiene datos inválidos' };
  }
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };
  const { empresaId, admin } = ctx;

  const zonas: Zona[] = parsed.data.zonas.map((z, i) => ({ ...z, orden: i }));
  // Mesas siempre con forma y puestos; lo demás sin ellos.
  const piezas: Pieza[] = parsed.data.piezas.map((p) => {
    if (p.tipo !== 'mesa') return { ...p, forma: null, puestos: null };
    const forma = p.forma ?? 'cuadrada';
    return { ...p, forma, puestos: p.puestos ?? FORMAS[forma].puestos };
  });

  const problema = validarPlano(zonas, piezas);
  if (problema) return { ok: false, error: problema };

  const [zonasDb, piezasDb] = await Promise.all([
    admin.from('salon_zonas').select('id').eq('empresa_id', empresaId),
    admin.from('salon_piezas').select('id, nombre, tipo').eq('empresa_id', empresaId),
  ]);
  if (faltaTabla(zonasDb.error) || faltaTabla(piezasDb.error)) {
    return { ok: false, error: SIN_MIGRACION };
  }
  if (zonasDb.error || piezasDb.error) {
    return { ok: false, error: 'No pudimos leer tu plano. Intenta de nuevo.' };
  }

  const zonasPropias = new Set((zonasDb.data ?? []).map((z) => z.id as string));
  const piezasPropias = new Map(
    (piezasDb.data ?? []).map((p) => [p.id as string, { nombre: p.nombre as string, tipo: p.tipo as string }]),
  );
  const idsZonas = new Set(zonas.map((z) => z.id));
  const idsPiezas = new Set(piezas.map((p) => p.id));

  const piezasQuitadas = [...piezasPropias.keys()].filter((id) => !idsPiezas.has(id));
  const zonasQuitadas = [...zonasPropias].filter((id) => !idsZonas.has(id));

  // Una mesa con gente sentada no se puede borrar del plano.
  if (piezasQuitadas.length > 0) {
    const { data: abiertas } = await admin
      .from('ventas')
      .select('mesa')
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierta')
      .in('mesa_id', piezasQuitadas)
      .limit(1);
    if (abiertas && abiertas.length > 0) {
      return {
        ok: false,
        error: `${abiertas[0].mesa} tiene una cuenta abierta. Cóbrala o cámbiala de mesa antes de quitarla.`,
      };
    }
  }

  const filaZona = (z: Zona) => ({ ...z, empresa_id: empresaId });
  const filaPieza = (p: Pieza) => ({ ...p, empresa_id: empresaId });

  const zonasViejas = zonas.filter((z) => zonasPropias.has(z.id)).map(filaZona);
  const zonasNuevas = zonas.filter((z) => !zonasPropias.has(z.id)).map(filaZona);
  const piezasViejas = piezas.filter((p) => piezasPropias.has(p.id)).map(filaPieza);
  const piezasNuevas = piezas.filter((p) => !piezasPropias.has(p.id)).map(filaPieza);

  // Orden: borrar piezas quitadas → zonas → piezas → borrar zonas quitadas (al
  // final, para que una mesa que se pasó a otra zona no se borre en cascada).
  if (piezasQuitadas.length > 0) {
    const { error } = await admin
      .from('salon_piezas')
      .delete()
      .eq('empresa_id', empresaId)
      .in('id', piezasQuitadas);
    if (error) return { ok: false, error: 'No pudimos quitar las piezas borradas.' };
  }
  if (zonasViejas.length > 0) {
    const { error } = await admin.from('salon_zonas').upsert(zonasViejas, { onConflict: 'id' });
    if (error) return { ok: false, error: 'No pudimos guardar las zonas.' };
  }
  if (zonasNuevas.length > 0) {
    const { error } = await admin.from('salon_zonas').insert(zonasNuevas);
    if (error) return { ok: false, error: 'No pudimos crear las zonas nuevas.' };
  }
  // upsert solo actualiza las columnas enviadas: la reserva de la mesa se conserva.
  if (piezasViejas.length > 0) {
    const { error } = await admin.from('salon_piezas').upsert(piezasViejas, { onConflict: 'id' });
    if (error) return { ok: false, error: 'No pudimos guardar las mesas.' };
  }
  if (piezasNuevas.length > 0) {
    const { error } = await admin.from('salon_piezas').insert(piezasNuevas);
    if (error) return { ok: false, error: 'No pudimos crear las mesas nuevas.' };
  }
  if (zonasQuitadas.length > 0) {
    const { error } = await admin
      .from('salon_zonas')
      .delete()
      .eq('empresa_id', empresaId)
      .in('id', zonasQuitadas);
    if (error) return { ok: false, error: 'No pudimos quitar las zonas borradas.' };
  }

  // Si renombraron una mesa con cuenta abierta, la cuenta lleva el nombre nuevo.
  const renombradas = piezas.filter(
    (p) => p.tipo === 'mesa' && piezasPropias.has(p.id) && piezasPropias.get(p.id)!.nombre !== p.nombre,
  );
  for (const p of renombradas) {
    await admin
      .from('ventas')
      .update({ mesa: p.nombre })
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierta')
      .eq('mesa_id', p.id);
  }

  refrescar();
  return { ok: true };
}

// ── Reservas ────────────────────────────────────────────────────────────────

const reservaSchema = z.object({
  mesa_id: z.uuid(),
  nombre: z.string().trim().min(1, { error: '¿A nombre de quién?' }).max(60),
  en: z.iso.datetime({ offset: true }),
  personas: z.number().int().min(1).max(99).nullable(),
});

export async function reservarMesa(input: unknown): Promise<Resultado> {
  { const neg = await negado('atender'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  const parsed = reservaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const t = new Date(parsed.data.en).getTime();
  const ahora = Date.now();
  if (t < ahora - 60 * 60 * 1000) return { ok: false, error: 'Esa hora ya pasó.' };
  if (t > ahora + 60 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Solo se puede reservar hasta 60 días adelante.' };
  }

  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const { data, error } = await ctx.admin
    .from('salon_piezas')
    .update({
      reserva_nombre: parsed.data.nombre,
      reserva_en: new Date(t).toISOString(),
      reserva_personas: parsed.data.personas,
    })
    .eq('id', parsed.data.mesa_id)
    .eq('empresa_id', ctx.empresaId)
    .eq('tipo', 'mesa')
    .select('id');
  if (faltaTabla(error)) return { ok: false, error: SIN_MIGRACION };
  if (error || !data || data.length === 0) {
    return { ok: false, error: 'No pudimos guardar la reserva.' };
  }
  refrescar();
  return { ok: true };
}

export async function quitarReserva(mesaId: string): Promise<Resultado> {
  { const neg = await negado('atender'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  if (!z.uuid().safeParse(mesaId).success) return { ok: false, error: 'Mesa inválida' };
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };
  const { error } = await ctx.admin
    .from('salon_piezas')
    .update({ reserva_nombre: null, reserva_en: null, reserva_personas: null })
    .eq('id', mesaId)
    .eq('empresa_id', ctx.empresaId);
  if (error) return { ok: false, error: 'No pudimos quitar la reserva.' };
  refrescar();
  return { ok: true };
}

// ── Servicio: pedir la cuenta, cambiar de mesa, juntar ──────────────────────

/** El mesero pidió la cuenta (amarillo) o se arrepintió (vuelve a rojo). */
export async function pedirCuenta(ventaId: string, pedir: boolean): Promise<Resultado> {
  { const neg = await negado('atender'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  if (!z.uuid().safeParse(ventaId).success) return { ok: false, error: 'Cuenta inválida' };
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const { data, error } = await ctx.admin
    .from('ventas')
    .update({ cuenta_pedida_en: pedir ? new Date().toISOString() : null })
    .eq('id', ventaId)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    return { ok: false, error: SIN_MIGRACION };
  }
  if (error) return { ok: false, error: 'No pudimos marcar la cuenta.' };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Esa cuenta ya la cobraron o anularon.' };
  }
  revalidatePath('/dashboard/mesas');
  return { ok: true };
}

/** Pasa la cuenta de una mesa a otra que esté libre. */
export async function moverCuenta(ventaId: string, mesaDestinoId: string): Promise<Resultado> {
  { const neg = await negado('atender'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  if (!z.uuid().safeParse(ventaId).success || !z.uuid().safeParse(mesaDestinoId).success) {
    return { ok: false, error: 'Datos inválidos' };
  }
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };

  const { data: destino } = await ctx.admin
    .from('salon_piezas')
    .select('id, nombre, tipo')
    .eq('id', mesaDestinoId)
    .eq('empresa_id', ctx.empresaId)
    .maybeSingle();
  if (!destino || destino.tipo !== 'mesa') return { ok: false, error: 'Esa mesa ya no existe.' };

  const { data, error } = await ctx.admin
    .from('ventas')
    .update({ mesa_id: destino.id, mesa: destino.nombre })
    .eq('id', ventaId)
    .eq('empresa_id', ctx.empresaId)
    .eq('estado', 'abierta')
    .select('id');
  if (error?.code === '23505') {
    return { ok: false, error: `${destino.nombre} ya está ocupada. Usa "Juntar" para unirlas.` };
  }
  if (error) return { ok: false, error: 'No pudimos cambiar la mesa.' };
  if (!data || data.length === 0) return { ok: false, error: 'Esa cuenta ya la cobraron o anularon.' };

  await ctx.admin
    .from('salon_piezas')
    .update({ reserva_nombre: null, reserva_en: null, reserva_personas: null })
    .eq('id', destino.id)
    .eq('empresa_id', ctx.empresaId);

  refrescar();
  return { ok: true };
}

/**
 * Junta dos cuentas abiertas: los platos de `desde` pasan a `hacia` y `desde`
 * desaparece. Se reclama `desde` PRIMERO (la pasa a cancelada si sigue
 * abierta) para que nadie la cobre mientras se mueven sus platos; si algo
 * falla, vuelve a abierta como estaba. Nada toca el inventario: ninguna de las
 * dos lo había descontado.
 */
export async function juntarCuentas(desdeId: string, haciaId: string): Promise<Resultado> {
  { const neg = await negado('atender'); if (neg) return { ok: false, error: neg }; } // permiso por rol (023)
  if (!z.uuid().safeParse(desdeId).success || !z.uuid().safeParse(haciaId).success) {
    return { ok: false, error: 'Datos inválidos' };
  }
  if (desdeId === haciaId) return { ok: false, error: 'Es la misma cuenta.' };
  const ctx = await contexto();
  if (!ctx) return { ok: false, error: 'No autenticado' };
  const { empresaId, admin } = ctx;

  const { data: cuentas } = await admin
    .from('ventas')
    .select('id, mesa, estado, cliente_id')
    .eq('empresa_id', empresaId)
    .in('id', [desdeId, haciaId]);
  const desde = cuentas?.find((c) => c.id === desdeId);
  const hacia = cuentas?.find((c) => c.id === haciaId);
  if (!desde || !hacia || desde.estado !== 'abierta' || hacia.estado !== 'abierta') {
    return { ok: false, error: 'Una de las dos cuentas ya se cobró o se anuló.' };
  }

  const { data: reclamada } = await admin
    .from('ventas')
    .update({ estado: 'cancelada', notas: `Se juntó con ${hacia.mesa}` })
    .eq('id', desdeId)
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta')
    .select('id');
  if (!reclamada || reclamada.length === 0) {
    return { ok: false, error: `${desde.mesa} la acaban de cobrar o cambiar.` };
  }
  const devolver = () =>
    admin.from('ventas').update({ estado: 'abierta', notas: null }).eq('id', desdeId).eq('empresa_id', empresaId);

  // Se mueven por id, para poder devolver EXACTAMENTE esos si algo falla.
  const { data: suyas } = await admin.from('venta_items').select('id').eq('venta_id', desdeId);
  const movidas = (suyas ?? []).map((l) => l.id as string);
  const { error: movErr } = movidas.length
    ? await admin.from('venta_items').update({ venta_id: haciaId }).in('id', movidas)
    : { error: null };
  if (movErr) {
    await devolver();
    return { ok: false, error: 'No pudimos mover los platos.' };
  }

  // Total de la cuenta que queda, desde sus líneas (nunca desde el navegador).
  const { data: lineas } = await admin.from('venta_items').select('subtotal').eq('venta_id', haciaId);
  const total = (lineas ?? []).reduce((a, l) => a + (Number(l.subtotal) || 0), 0);
  const cambios: Record<string, unknown> = { subtotal: total, total };
  if (!hacia.cliente_id && desde.cliente_id) cambios.cliente_id = desde.cliente_id;

  const { data: sigue } = await admin
    .from('ventas')
    .update(cambios)
    .eq('id', haciaId)
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta')
    .select('id');
  if (!sigue || sigue.length === 0) {
    // La de destino se cobró en este instante: los platos vuelven a su mesa.
    if (movidas.length) {
      await admin.from('venta_items').update({ venta_id: desdeId }).in('id', movidas);
    }
    await devolver();
    return { ok: false, error: `${hacia.mesa} la acaban de cobrar. No se juntó nada.` };
  }

  // La cuenta vacía no es una venta: se borra. Si no se puede, queda anulada.
  await admin.from('ventas').delete().eq('id', desdeId).eq('empresa_id', empresaId).eq('estado', 'cancelada');

  refrescar();
  return { ok: true };
}

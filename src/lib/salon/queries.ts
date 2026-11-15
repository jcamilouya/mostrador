import { createClient } from '@/lib/supabase/server';
import type { FormaMesa, PiezaConReserva, TipoPieza, Zona } from './modelo';

export type Salon = {
  /** false si la migración 021 no se ha corrido: la app sigue sin plano. */
  disponible: boolean;
  zonas: Zona[];
  piezas: PiezaConReserva[];
};

const SIN_SALON: Salon = { disponible: false, zonas: [], piezas: [] };

/** La tabla no existe todavía (migración 021 sin correr). */
function faltaTabla(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/**
 * El plano del salón: zonas en su orden y todas sus piezas. Lee con la sesión
 * del usuario (RLS, solo lo suyo). Si faltan las tablas devuelve
 * `disponible: false` y la pantalla de Mesas sigue funcionando como antes.
 */
export async function getSalon(empresaId: string): Promise<Salon> {
  const supabase = await createClient();
  const [zonasRes, piezasRes] = await Promise.all([
    supabase
      .from('salon_zonas')
      .select('id, nombre, cols, filas, orden')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('salon_piezas')
      .select(
        'id, zona_id, tipo, forma, nombre, puestos, x, y, w, h, reserva_nombre, reserva_en, reserva_personas',
      )
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true }),
  ]);

  if (faltaTabla(zonasRes.error) || faltaTabla(piezasRes.error)) return SIN_SALON;
  if (zonasRes.error || piezasRes.error) return { ...SIN_SALON, disponible: true };

  const zonas: Zona[] = (zonasRes.data ?? []).map((z) => ({
    id: z.id as string,
    nombre: z.nombre as string,
    cols: Number(z.cols),
    filas: Number(z.filas),
    orden: Number(z.orden) || 0,
  }));

  const piezas: PiezaConReserva[] = (piezasRes.data ?? []).map((p) => ({
    id: p.id as string,
    zona_id: p.zona_id as string,
    tipo: p.tipo as TipoPieza,
    forma: (p.forma as FormaMesa | null) ?? null,
    nombre: p.nombre as string,
    puestos: p.puestos == null ? null : Number(p.puestos),
    x: Number(p.x),
    y: Number(p.y),
    w: Number(p.w),
    h: Number(p.h),
    reserva:
      p.reserva_nombre && p.reserva_en
        ? {
            nombre: p.reserva_nombre as string,
            en: p.reserva_en as string,
            personas: p.reserva_personas == null ? null : Number(p.reserva_personas),
          }
        : null,
  }));

  return { disponible: true, zonas, piezas };
}

/**
 * Las mesas del plano para el selector del POS, con cuáles están ocupadas.
 * Tres consultas chicas en paralelo; si falta la migración 021 devuelve [] y
 * el selector muestra los números 1–12 de siempre.
 */
export async function getMesasParaPOS(
  empresaId: string,
): Promise<{ id: string; nombre: string; zona: string; ocupada: boolean }[]> {
  const supabase = await createClient();
  const [zonasRes, mesasRes, abiertasRes] = await Promise.all([
    supabase
      .from('salon_zonas')
      .select('id, nombre, orden')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true }),
    supabase.from('salon_piezas').select('id, zona_id, nombre').eq('empresa_id', empresaId).eq('tipo', 'mesa'),
    supabase
      .from('ventas')
      .select('mesa_id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierta')
      .not('mesa_id', 'is', null),
  ]);
  if (zonasRes.error || mesasRes.error || !mesasRes.data?.length) return [];

  const zonas = zonasRes.data ?? [];
  const zonaNombre = new Map(zonas.map((z) => [z.id as string, z.nombre as string]));
  const orden = new Map(zonas.map((z, i) => [z.id as string, i]));
  const ocupadas = new Set((abiertasRes.data ?? []).map((v) => v.mesa_id as string));

  return mesasRes.data
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      zonaId: p.zona_id as string,
    }))
    .sort(
      (a, b) =>
        (orden.get(a.zonaId) ?? 0) - (orden.get(b.zonaId) ?? 0) ||
        a.nombre.localeCompare(b.nombre, 'es', { numeric: true }),
    )
    .map((m) => ({
      id: m.id,
      nombre: m.nombre,
      zona: zonaNombre.get(m.zonaId) ?? '',
      ocupada: ocupadas.has(m.id),
    }));
}

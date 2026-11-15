import type { createAdminClient } from '@/lib/supabase/admin';

/**
 * Crear comandas (lo que se manda a cocina). Helper de servidor, NO Server
 * Action: lo llaman `guardarCuenta`/`marcharCuenta` (mesas y domicilios) y
 * `registrarVenta` (para llevar), siempre después de validar la sesión.
 */
type Admin = ReturnType<typeof createAdminClient>;

export type ItemComanda = { cantidad: number; nombre: string; nota: string | null };

export type NuevaComanda = {
  empresaId: string;
  ventaId: string | null;
  tipo: 'pedido' | 'anulado';
  titulo: string;
  detalle?: string | null;
  items: ItemComanda[];
  creadoPor?: string | null;
};

/** La tabla no existe todavía (migración 023 sin correr). */
export function faltaTablaComandas(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/**
 * Inserta la comanda con el siguiente número del negocio. Si dos equipos
 * marchan a la vez y toman el mismo número, el índice único rechaza a uno
 * (23505) y ese reintenta con el siguiente.
 */
export async function crearComanda(admin: Admin, c: NuevaComanda): Promise<number | null> {
  if (c.items.length === 0) return null;
  for (let intento = 0; intento < 6; intento++) {
    const { data: ultima, error: leerErr } = await admin
      .from('comandas')
      .select('numero')
      .eq('empresa_id', c.empresaId)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (faltaTablaComandas(leerErr)) return null;
    const numero = (Number(ultima?.numero) || 0) + 1;
    const { error } = await admin.from('comandas').insert({
      empresa_id: c.empresaId,
      venta_id: c.ventaId,
      numero,
      tipo: c.tipo,
      titulo: c.titulo.slice(0, 80),
      detalle: c.detalle ?? null,
      items: c.items,
      creado_por: c.creadoPor ?? null,
    });
    if (!error) return numero;
    if (error.code !== '23505') return null;
  }
  return null;
}

/**
 * Marca como marchadas las líneas que faltaban de una cuenta y crea su
 * comanda. El UPDATE solo toma filas con `marchado_en IS NULL`: si dos
 * equipos marchan a la vez, cada línea sale en UNA sola comanda.
 */
export async function marcharPendientes(
  admin: Admin,
  datos: { empresaId: string; ventaId: string; titulo: string; detalle?: string | null; creadoPor?: string | null },
): Promise<{ numero: number | null; error?: string }> {
  const { data: tomadas, error } = await admin
    .from('venta_items')
    .update({ marchado_en: new Date().toISOString() })
    .eq('venta_id', datos.ventaId)
    .is('marchado_en', null)
    .select('id, cantidad, nombre_producto, nota');
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      return { numero: null, error: 'Para marchar a cocina falta correr la migración 023 en Supabase.' };
    }
    return { numero: null, error: 'No pudimos marchar el pedido.' };
  }
  if (!tomadas || tomadas.length === 0) return { numero: null };

  const numero = await crearComanda(admin, {
    empresaId: datos.empresaId,
    ventaId: datos.ventaId,
    tipo: 'pedido',
    titulo: datos.titulo,
    detalle: datos.detalle,
    creadoPor: datos.creadoPor,
    items: tomadas.map((t) => ({
      cantidad: Number(t.cantidad) || 0,
      nombre: t.nombre_producto as string,
      nota: (t.nota as string | null) ?? null,
    })),
  });
  if (numero == null) {
    // Sin comanda la cocina no se entera: se devuelven las líneas a "sin
    // marchar" para que el mesero lo vea y vuelva a intentar.
    await admin
      .from('venta_items')
      .update({ marchado_en: null })
      .in('id', tomadas.map((t) => t.id as string));
    return { numero: null, error: 'No pudimos crear la comanda. Intenta marchar de nuevo.' };
  }
  return { numero };
}

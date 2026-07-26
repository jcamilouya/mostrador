'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanInfo } from '@/lib/plan/queries';
import {
  descontarIngredientesPorVenta,
  descontarInsumosVendidos,
  descontarStockProductosPorVenta,
} from '@/lib/insumos/consumo';
import { normalizarVariantes } from '@/lib/inventario/queries';
import type { VentaResult } from './types';

const itemSchema = z.object({
  producto_id: z.uuid(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().nonnegative(),
  precio_compra: z.number().nonnegative(),
  nombre: z.string().min(1),
  // Nombre de la opción/combo elegida (para resolver su precio server-side).
  variante: z.string().max(80).nullable().optional(),
  // Bebida del Inventario elegida para esta línea (módulo Bebidas).
  insumo_extra_id: z.uuid().nullable().optional(),
});

const ventaSchema = z.object({
  metodo_pago: z.enum(['efectivo', 'breb', 'transferencia', 'mixto']),
  items: z.array(itemSchema).min(1, { error: 'Agrega al menos un producto' }),
  notas: z.string().max(500).optional(),
  // Para Bre-B: true = el dueño ya confirmó el pago en el POS (completa la venta).
  confirmado: z.boolean().optional(),
  // ID del QR generado por Bancolombia — para conciliar con el webhook de pago.
  breb_transaccion_id: z.string().max(120).optional(),
  // Cliente OPCIONAL: una venta nunca se bloquea por no tener cliente.
  cliente_id: z.uuid().optional().nullable(),
  // Llave única por intento de cobro: evita duplicar la venta si se reintenta.
  idempotency_key: z.string().max(80).optional(),
});

export async function registrarVenta(input: unknown): Promise<VentaResult> {
  const parsed = ventaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario?.empresa_id) return { ok: false, error: 'Sin empresa' };

  const empresaId = usuario.empresa_id;

  // Bloqueo suave: trial vencido sin plan pagado no puede crear ventas nuevas.
  const plan = await getPlanInfo(empresaId);
  if (plan.bloqueado) {
    return {
      ok: false,
      error: 'Tu prueba gratis terminó. Mejora tu plan para seguir vendiendo.',
    };
  }

  const admin = createAdminClient();

  // Precios SERVER-SIDE: no confiar en los que manda el navegador. Se resuelven
  // contra la BD (precio del producto o de la opción/combo elegida).
  const prodIds = [...new Set(parsed.data.items.map((i) => i.producto_id))];
  const { data: prods } = await admin
    .from('productos')
    .select('id, precio_venta, precio_compra, variantes')
    .eq('empresa_id', empresaId)
    .in('id', prodIds);
  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]));

  const items = parsed.data.items.map((i) => {
    const p = prodMap.get(i.producto_id);
    let precioUnitario = i.precio_unitario; // fallback si el producto ya no existe
    let precioCompra = i.precio_compra;
    if (p) {
      precioCompra = Number(p.precio_compra) || 0;
      precioUnitario = Number(p.precio_venta) || 0;
      if (i.variante) {
        const v = normalizarVariantes(p.variantes).find((x) => x.nombre === i.variante);
        if (v) precioUnitario = v.precio;
      }
    }
    return { ...i, precio_unitario: precioUnitario, precio_compra: precioCompra };
  });

  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const total = subtotal;

  // Bre-B queda pendiente salvo que el dueño confirme el pago en el momento.
  const pendiente = parsed.data.metodo_pago === 'breb' && !parsed.data.confirmado;

  const ventaInsert: Record<string, unknown> = {
    empresa_id: empresaId,
    subtotal,
    iva: 0,
    total,
    metodo_pago: parsed.data.metodo_pago,
    estado: pendiente ? 'pendiente' : 'completada',
    breb_transaccion_id: parsed.data.breb_transaccion_id ?? null,
    breb_estado: pendiente ? 'pendiente' : null,
    notas: parsed.data.notas ?? null,
  };
  if (parsed.data.cliente_id) ventaInsert.cliente_id = parsed.data.cliente_id;
  if (parsed.data.idempotency_key) ventaInsert.idempotency_key = parsed.data.idempotency_key;

  // Insertar venta con idempotencia: reintentar con la misma llave (caída de red)
  // no crea otra venta.
  let insertRes = await admin
    .from('ventas')
    .insert(ventaInsert)
    .select('id, numero_venta, total')
    .single();

  // Si la columna idempotency_key aún no existe (migración 011 sin correr),
  // reintentar sin ella para no bloquear la venta.
  if (insertRes.error?.code === '42703' && 'idempotency_key' in ventaInsert) {
    delete ventaInsert.idempotency_key;
    insertRes = await admin
      .from('ventas')
      .insert(ventaInsert)
      .select('id, numero_venta, total')
      .single();
  }

  if (insertRes.error) {
    // Llave duplicada = reintento del mismo cobro → devolver la venta ya creada.
    if (insertRes.error.code === '23505' && parsed.data.idempotency_key) {
      const { data: existente } = await admin
        .from('ventas')
        .select('id, numero_venta, total')
        .eq('empresa_id', empresaId)
        .eq('idempotency_key', parsed.data.idempotency_key)
        .maybeSingle();
      if (existente) {
        return {
          ok: true,
          ventaId: existente.id,
          numero: existente.numero_venta,
          total: Number(existente.total),
        };
      }
    }
    console.error('[registrarVenta] ventas insert', insertRes.error);
    return { ok: false, error: `No se pudo registrar la venta: ${insertRes.error.message}` };
  }
  const venta = insertRes.data!;

  // Insertar items. La columna insumo_extra_id (bebida elegida) solo se envía
  // cuando la venta la usa, para no depender de la migración 008 en el resto.
  const usaBebidas = items.some((i) => i.insumo_extra_id);
  const itemsRows = items.map((i) => ({
    venta_id: venta.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    precio_compra: i.precio_compra,
    subtotal: i.cantidad * i.precio_unitario,
    ...(usaBebidas ? { insumo_extra_id: i.insumo_extra_id ?? null } : {}),
  }));

  const { error: itemsErr } = await admin.from('venta_items').insert(itemsRows);
  if (itemsErr) {
    console.error('[registrarVenta] venta_items insert', itemsErr);
    await admin.from('ventas').delete().eq('id', venta.id);
    return { ok: false, error: `No se pudieron guardar los items: ${itemsErr.message}` };
  }

  // Descontar stock + registrar movimiento, solo si la venta queda completada
  if (!pendiente) {
    // Descontar el stock de los productos (si es bebida vinculada, del insumo).
    await descontarStockProductosPorVenta(
      admin,
      empresaId,
      venta.id,
      venta.numero_venta,
      items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    );

    // Descontar los ingredientes que consumió la venta (según recetas).
    await descontarIngredientesPorVenta(
      admin,
      empresaId,
      venta.id,
      venta.numero_venta,
      items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    );

    // Descontar las bebidas elegidas (módulo Bebidas del Inventario).
    await descontarInsumosVendidos(
      admin,
      empresaId,
      venta.id,
      venta.numero_venta,
      items
        .filter((i) => i.insumo_extra_id)
        .map((i) => ({ insumo_id: i.insumo_extra_id as string, cantidad: i.cantidad })),
    );
  }

  // Acumular compras del cliente (si se asoció uno y la venta quedó completada).
  if (parsed.data.cliente_id && !pendiente) {
    const { data: cli } = await admin
      .from('clientes')
      .select('total_compras, cantidad_compras')
      .eq('id', parsed.data.cliente_id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (cli) {
      await admin
        .from('clientes')
        .update({
          total_compras: (Number(cli.total_compras) || 0) + total,
          cantidad_compras: (Number(cli.cantidad_compras) || 0) + 1,
          ultima_compra: new Date().toISOString(),
        })
        .eq('id', parsed.data.cliente_id)
        .eq('empresa_id', empresaId);
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/inventario');
  revalidatePath('/dashboard/clientes');

  return {
    ok: true,
    ventaId: venta.id,
    numero: venta.numero_venta,
    total: Number(venta.total),
  };
}

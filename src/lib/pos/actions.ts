'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanInfo } from '@/lib/plan/queries';
import { descontarIngredientesPorVenta } from '@/lib/insumos/consumo';
import type { VentaResult } from './types';

const itemSchema = z.object({
  producto_id: z.uuid(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().nonnegative(),
  precio_compra: z.number().nonnegative(),
  nombre: z.string().min(1),
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

  const subtotal = parsed.data.items.reduce(
    (acc, i) => acc + i.cantidad * i.precio_unitario,
    0,
  );
  const total = subtotal;

  // Bre-B queda pendiente salvo que el dueño confirme el pago en el momento.
  const pendiente = parsed.data.metodo_pago === 'breb' && !parsed.data.confirmado;

  // Insertar venta. Solo incluimos cliente_id si viene uno, para no depender
  // de que la columna exista (migración de clientes) en el resto de ventas.
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

  const { data: venta, error: ventaErr } = await admin
    .from('ventas')
    .insert(ventaInsert)
    .select('id, numero_venta, total')
    .single();

  if (ventaErr || !venta) {
    console.error('[registrarVenta] ventas insert', ventaErr);
    return { ok: false, error: `No se pudo registrar la venta: ${ventaErr?.message ?? 'error desconocido'}` };
  }

  // Insertar items
  const itemsRows = parsed.data.items.map((i) => ({
    venta_id: venta.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    precio_compra: i.precio_compra,
    subtotal: i.cantidad * i.precio_unitario,
  }));

  const { error: itemsErr } = await admin.from('venta_items').insert(itemsRows);
  if (itemsErr) {
    console.error('[registrarVenta] venta_items insert', itemsErr);
    await admin.from('ventas').delete().eq('id', venta.id);
    return { ok: false, error: `No se pudieron guardar los items: ${itemsErr.message}` };
  }

  // Descontar stock + registrar movimiento, solo si la venta queda completada
  if (!pendiente) {
    for (const i of parsed.data.items) {
      const { data: prodActual } = await admin
        .from('productos')
        .select('stock_actual')
        .eq('id', i.producto_id)
        .eq('empresa_id', empresaId)
        .single();
      const stockNuevo = Math.max(0, (prodActual?.stock_actual ?? 0) - i.cantidad);
      await admin
        .from('productos')
        .update({ stock_actual: stockNuevo, updated_at: new Date().toISOString() })
        .eq('id', i.producto_id)
        .eq('empresa_id', empresaId);

      await admin.from('movimientos_inventario').insert({
        empresa_id: empresaId,
        producto_id: i.producto_id,
        tipo: 'salida',
        cantidad: i.cantidad,
        referencia_tipo: 'venta',
        referencia_id: venta.id,
        notas: `Venta #${venta.numero_venta}`,
      });
    }

    // Descontar los ingredientes que consumió la venta (según recetas).
    await descontarIngredientesPorVenta(
      admin,
      empresaId,
      venta.id,
      venta.numero_venta,
      parsed.data.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
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

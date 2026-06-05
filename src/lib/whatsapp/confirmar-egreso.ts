import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from './send';

export async function confirmarEgresoPendiente(empresaId: string, numeroDueno: string): Promise<void> {
  const admin = createAdminClient();

  const { data: pendiente } = await admin
    .from('egresos_pendientes_whatsapp')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('numero_whatsapp', numeroDueno)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!pendiente) {
    await enviarMensaje(numeroDueno, 'No encontré ninguna factura pendiente 🤔 Envíame la foto de nuevo.');
    return;
  }

  const d = pendiente.datos_ia as {
    proveedor: string | null;
    monto: number;
    fecha: string | null;
    categoria: string;
    descripcion: string | null;
  };

  const { error } = await admin.from('egresos').insert({
    empresa_id: empresaId,
    proveedor: d.proveedor,
    monto: d.monto,
    fecha: d.fecha ?? new Date().toISOString().slice(0, 10),
    categoria: d.categoria ?? 'proveedores',
    descripcion: d.descripcion,
    fuente: 'whatsapp_ia',
    metodo_pago: 'efectivo',
  });

  if (error) {
    await enviarMensaje(numeroDueno, 'Algo salió mal al guardar 😓 Inténtalo de nuevo.');
    return;
  }

  await admin
    .from('egresos_pendientes_whatsapp')
    .update({ estado: 'confirmado' })
    .eq('id', pendiente.id);

  const montoFormateado = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(d.monto);

  await enviarMensaje(
    numeroDueno,
    `✅ *¡Gasto registrado!*\n\n` +
    `${montoFormateado}${d.proveedor ? ` de ${d.proveedor}` : ''} ya está en tu dashboard.\n\n` +
    `Cuando tengas otra factura, mándame la foto 📸`,
  );
}

export async function cancelarEgresoPendiente(empresaId: string, numeroDueno: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('egresos_pendientes_whatsapp')
    .update({ estado: 'cancelado' })
    .eq('empresa_id', empresaId)
    .eq('numero_whatsapp', numeroDueno)
    .eq('estado', 'pendiente');

  await enviarMensaje(numeroDueno, 'Entendido, cancelado 👍 Mándame la foto cuando quieras 📸');
}

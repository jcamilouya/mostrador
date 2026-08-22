import { createClient } from '@/lib/supabase/server';

export type BrebConfig = {
  llave: string | null;
  banco: string | null;
  merchantId: string | null;
  /** Payload EMVCo del QR oficial del negocio (subido desde la app de su banco). */
  qrPayload: string | null;
  nombreNegocio: string;
  configurado: boolean;
  /** % que el negocio le suma a la venta si el cliente paga con tarjeta. 0 = sin recargo. */
  recargoTarjetaPct: number;
};

export async function getBrebConfig(empresaId: string): Promise<BrebConfig> {
  const supabase = await createClient();
  const campos = 'nombre, breb_llave, breb_banco, breb_merchant_id, breb_qr_payload';
  // Sin la migración 013 la columna del recargo no existe: reintentar sin ella.
  let { data } = await supabase
    .from('empresas')
    .select(`${campos}, recargo_tarjeta_pct`)
    .eq('id', empresaId)
    .maybeSingle();
  if (!data) {
    ({ data } = await supabase
      .from('empresas')
      .select(campos)
      .eq('id', empresaId)
      .maybeSingle());
  }

  return {
    recargoTarjetaPct: Number((data as Record<string, unknown> | null)?.recargo_tarjeta_pct) || 0,
    llave: data?.breb_llave ?? null,
    banco: data?.breb_banco ?? null,
    merchantId: data?.breb_merchant_id ?? null,
    qrPayload: data?.breb_qr_payload ?? null,
    nombreNegocio: data?.nombre ?? 'Mi negocio',
    // Está configurado si tiene llave (para mostrar al cliente) o un QR oficial.
    configurado: Boolean(data?.breb_llave || data?.breb_qr_payload),
  };
}

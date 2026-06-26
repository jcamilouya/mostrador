import { createClient } from '@/lib/supabase/server';

export type BrebConfig = {
  llave: string | null;
  banco: string | null;
  merchantId: string | null;
  /** Payload EMVCo del QR oficial del negocio (subido desde la app de su banco). */
  qrPayload: string | null;
  nombreNegocio: string;
  configurado: boolean;
};

export async function getBrebConfig(empresaId: string): Promise<BrebConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('empresas')
    .select('nombre, breb_llave, breb_banco, breb_merchant_id, breb_qr_payload')
    .eq('id', empresaId)
    .maybeSingle();

  return {
    llave: data?.breb_llave ?? null,
    banco: data?.breb_banco ?? null,
    merchantId: data?.breb_merchant_id ?? null,
    qrPayload: data?.breb_qr_payload ?? null,
    nombreNegocio: data?.nombre ?? 'Mi negocio',
    // Está configurado si tiene llave (para mostrar al cliente) o un QR oficial.
    configurado: Boolean(data?.breb_llave || data?.breb_qr_payload),
  };
}

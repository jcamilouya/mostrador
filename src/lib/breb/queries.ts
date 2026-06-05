import { createClient } from '@/lib/supabase/server';

export type BrebConfig = {
  llave: string | null;
  banco: string | null;
  merchantId: string | null;
  nombreNegocio: string;
  configurado: boolean;
};

export async function getBrebConfig(empresaId: string): Promise<BrebConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('empresas')
    .select('nombre, breb_llave, breb_banco, breb_merchant_id')
    .eq('id', empresaId)
    .maybeSingle();

  return {
    llave: data?.breb_llave ?? null,
    banco: data?.breb_banco ?? null,
    merchantId: data?.breb_merchant_id ?? null,
    nombreNegocio: data?.nombre ?? 'Mi negocio',
    configurado: Boolean(data?.breb_llave),
  };
}

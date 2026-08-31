import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getEmpresaIdDelUsuario } from '@/lib/inventario/queries';
import { getBrebConfig } from '@/lib/breb/queries';
import { ConfigForm } from '@/components/configuracion/ConfigForm';

export const metadata: Metadata = {
  title: 'Configuración — Mostrador',
};

export default async function ConfiguracionPage() {
  const empresaId = await getEmpresaIdDelUsuario();
  if (!empresaId) redirect('/onboarding');

  const supabase = await createClient();
  const [{ data: empresa }, breb] = await Promise.all([
    supabase
      .from('empresas')
      .select('nombre, telefono, direccion, nit, categoria, whatsapp_numero')
      .eq('id', empresaId)
      .maybeSingle(),
    getBrebConfig(empresaId),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Datos de tu negocio y cobros con Bre-B.
        </p>
      </header>

      <ConfigForm
        empresa={{
          nombre: empresa?.nombre ?? '',
          telefono: empresa?.telefono ?? null,
          direccion: empresa?.direccion ?? null,
          nit: (empresa as Record<string, unknown> | null)?.nit as string | null ?? null,
          categoria: (empresa as Record<string, unknown> | null)?.categoria as string | null ?? null,
          whatsapp_numero:
            ((empresa as Record<string, unknown> | null)?.whatsapp_numero as string | null) ?? null,
        }}
        breb={breb}
      />
    </div>
  );
}

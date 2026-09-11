import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSesion } from '@/lib/auth/sesion';
import { getConfigCarta } from '@/lib/carta/queries';
import { CartaManager } from '@/components/carta/CartaManager';
import { AyudaPantalla } from '@/components/shared/AyudaPantalla';

const AYUDA = {
  titulo: 'Cómo funciona tu carta digital',
  puntos: [
    'Es tu menú en internet: el cliente escanea un QR en la mesa y ve tus platos y precios.',
    'Sale de los productos que ya tienes cargados. Si cambias un precio, la carta cambia sola.',
    'Enciéndela, descarga el QR, imprímelo y pégalo en las mesas.',
    'Puedes apagar productos que vendes pero no quieres mostrar, como domicilio o bolsa.',
  ],
};

export const metadata: Metadata = {
  title: 'Carta digital — Mostrador',
};

export default async function CartaPage() {
  const sesion = await getSesion();
  const empresaId = sesion?.empresaId ?? null;
  if (!empresaId) redirect('/onboarding');

  const config = await getConfigCarta(empresaId);

  // El dominio sale de la petición, no de una variable de entorno: así el link
  // y el QR salen bien en producción, en un preview de Vercel y en localhost,
  // sin tener que acordarse de configurar nada.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${protocolo}://${host}`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header>
        <span className="flex items-center gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Carta digital</h1>
          <AyudaPantalla titulo={AYUDA.titulo} puntos={AYUDA.puntos} />
        </span>
        <p className="text-sm text-muted-foreground">
          Tu menú con un QR para las mesas. Sale de los productos que ya tienes cargados.
        </p>
      </header>

      <CartaManager config={config} base={base} />
    </div>
  );
}

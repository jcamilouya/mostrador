import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, Phone } from 'lucide-react';
import { getCartaPublica } from '@/lib/carta/queries';
import { formatCOP } from '@/lib/utils/format';

/**
 * La carta del negocio, pública. Es lo que ve un cliente sentado en la mesa
 * después de escanear el QR — sin cuenta, sin instalar nada, sin login.
 *
 * Se rehace cada minuto: si el dueño sube un precio, el siguiente que escanee lo
 * ve, pero una mesa llena de gente escaneando no golpea la base de datos.
 */
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const carta = await getCartaPublica(slug);
  if (!carta) return { title: 'Carta no encontrada' };

  return {
    title: `Carta de ${carta.negocio}`,
    description: `Mira los platos y precios de ${carta.negocio}.`,
    // Es una carta, no contenido que queramos indexar en Google.
    robots: { index: false, follow: false },
  };
}

export default async function CartaPage({ params }: Props) {
  const { slug } = await params;
  const carta = await getCartaPublica(slug);

  // Slug inexistente y carta apagada dan el MISMO 404: desde fuera no se puede
  // distinguir si un negocio existe pero tiene la carta cerrada.
  if (!carta) notFound();

  const vacia = carta.grupos.length === 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-8 space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{carta.negocio}</h1>

        {(carta.telefono || carta.direccion) && (
          <div className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
            {carta.direccion && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                {carta.direccion}
              </p>
            )}
            {carta.telefono && (
              <a
                href={`tel:${carta.telefono.replace(/\s+/g, '')}`}
                className="flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <Phone className="h-4 w-4 shrink-0" />
                {carta.telefono}
              </a>
            )}
          </div>
        )}
      </header>

      {vacia ? (
        <p className="rounded-3xl bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
          Este negocio todavía no ha publicado sus platos.
        </p>
      ) : (
        <div className="space-y-8">
          {carta.grupos.map((grupo) => (
            <section key={grupo.categoria}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {grupo.categoria}
              </h2>

              <ul className="divide-y divide-border overflow-hidden rounded-3xl bg-card shadow-sm">
                {grupo.items.map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-medium">{item.nombre}</p>
                      <p className="shrink-0 font-semibold tabular-nums">
                        {formatCOP(item.precio)}
                      </p>
                    </div>

                    {item.descripcion && (
                      <p className="mt-1 text-sm text-muted-foreground">{item.descripcion}</p>
                    )}

                    {item.opciones.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {item.opciones.map((o) => (
                          <li
                            key={o.nombre}
                            className="flex items-baseline justify-between gap-4 text-sm text-muted-foreground"
                          >
                            <span>{o.nombre}</span>
                            <span className="shrink-0 tabular-nums">{formatCOP(o.precio)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Los precios pueden cambiar sin previo aviso.
      </p>
    </main>
  );
}

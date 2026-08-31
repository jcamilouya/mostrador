'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, MessageCircle } from 'lucide-react';

/**
 * Ayuda de la pantalla en la que está parado el dueño: treinta segundos de
 * explicación y un botón para escribirnos por WhatsApp.
 *
 * Para este público WhatsApp vale más que cualquier documentación: si algo no
 * se entiende, escriben — no buscan en un manual.
 */
export function AyudaPantalla({
  titulo,
  puntos,
}: {
  titulo: string;
  puntos: string[];
}) {
  const [abierto, setAbierto] = useState(false);
  // Sin número configurado, la ayuda se muestra sin el botón de WhatsApp.
  const soporte = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? '').replace(/D/g, '');

  const mensaje = encodeURIComponent(`Hola, tengo una duda con "${titulo}" en Mostrador.`);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ayuda sobre ${titulo}`}
        title="¿Cómo funciona esta pantalla?"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ul className="space-y-2.5">
              {puntos.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            {soporte && (
              <a
                href={`https://wa.me/${soporte}?text=${mensaje}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" className="h-12 w-full rounded-2xl gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Sigo con dudas, escríbenos
                </Button>
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

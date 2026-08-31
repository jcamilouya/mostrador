'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Hand, ShoppingBag, Banknote, X, ArrowRight } from 'lucide-react';
import { marcarGuiaPosVista } from '@/lib/practica/actions';

/**
 * Los tres globos de la pantalla de vender. SOLO lo que hay que saber para
 * hacer una venta — nada de inventario, recetas ni Bre-B: eso llega después,
 * cuando ya esté vendiendo.
 *
 * Aparece una sola vez y se guarda en la empresa, no en el navegador: si el
 * dueño cambia de celular no lo vuelve a ver, y si lo cierra no reaparece.
 */

const PASOS = [
  {
    icon: Hand,
    titulo: 'Toca lo que te pidieron',
    texto: 'Cada cuadro es un producto tuyo. Tócalo y se suma a la cuenta. Si lo tocas dos veces, van dos.',
  },
  {
    icon: ShoppingBag,
    titulo: 'Ahí se va armando la cuenta',
    texto: 'A un lado ves lo que lleva el cliente y cuánto va. Puedes quitar cosas o cambiar cantidades.',
  },
  {
    icon: Banknote,
    titulo: 'Toca Cobrar y listo',
    texto: 'Eliges cómo te pagaron —efectivo, tarjeta, transferencia— y la venta queda registrada.',
  },
];

export function GuiaPOS() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [cerrado, setCerrado] = useState(false);

  function cerrar() {
    setCerrado(true);
    // No se espera: si falla, lo peor que pasa es que vuelva a salir una vez.
    void marcarGuiaPosVista().then(() => router.refresh());
  }

  if (cerrado) return null;

  const actual = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;
  const Icono = actual.icon;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 lg:bottom-6 lg:left-auto lg:right-6 lg:w-96 lg:p-0">
      <div className="rounded-3xl bg-card p-5 shadow-lg ring-1 ring-border">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ingreso)]/15">
            <Icono className="h-5 w-5 text-[var(--ingreso)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{actual.titulo}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{actual.texto}</p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar la guía"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {PASOS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === paso ? 'w-5 bg-foreground' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>
          <Button
            className="rounded-2xl gap-1.5"
            onClick={() => (ultimo ? cerrar() : setPaso((p) => p + 1))}
          >
            {ultimo ? 'Entendido' : 'Siguiente'}
            {!ultimo && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

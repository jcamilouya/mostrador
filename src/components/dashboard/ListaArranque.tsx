'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Rocket } from 'lucide-react';
import type { Tarea } from '@/lib/tareas/queries';

const KEY = 'mostrador_arranque_doblado';

/**
 * Lista de arranque. Reemplaza el cartel de bienvenida viejo, que era un afiche:
 * decía "carga tus productos" aunque ya tuvieras cuarenta, se cerraba para
 * siempre con una X y vivía en el navegador — cambiabas de celular y volvía.
 *
 * Aquí cada punto ya viene marcado desde el servidor, se puede DOBLAR pero no
 * cerrar, y cuando está todo hecho no se pinta nunca más.
 */
export function ListaArranque({ tareas }: { tareas: Tarea[] }) {
  const [doblado, setDoblado] = useState(false);

  // Solo la preferencia de doblarla vive en el navegador: es cosmética y por
  // dispositivo. Lo que está hecho y lo que no sale siempre de la base de datos.
  useEffect(() => {
    try {
      setDoblado(localStorage.getItem(KEY) === '1');
    } catch {
      // Navegador sin almacenamiento: se muestra abierta, no pasa nada.
    }
  }, []);

  function alternar() {
    setDoblado((d) => {
      const nuevo = !d;
      try {
        localStorage.setItem(KEY, nuevo ? '1' : '0');
      } catch {
        // Sin almacenamiento no se recuerda, pero la lista funciona igual.
      }
      return nuevo;
    });
  }

  const hechas = tareas.filter((t) => t.hecha).length;
  const total = tareas.length;
  if (total === 0 || hechas === total) return null; // terminó: no molestar más

  const siguiente = tareas.find((t) => !t.hecha);
  const pct = Math.round((hechas / total) * 100);

  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-sm">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!doblado}
        className="flex w-full items-center gap-3 p-5 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ingreso)]/15">
          <Rocket className="h-5 w-5 text-[var(--ingreso)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Pon a punto tu negocio</p>
          <p className="truncate text-sm text-muted-foreground">
            {hechas} de {total} listo{hechas === 1 ? '' : 's'}
            {siguiente && ` · sigue: ${siguiente.titulo.toLowerCase()}`}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
          {pct}%
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            doblado ? '' : 'rotate-180'
          }`}
        />
      </button>

      <div className="h-1.5 bg-secondary">
        <div
          className="h-full bg-[var(--ingreso)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!doblado && (
        <ul className="divide-y divide-border">
          {tareas.map((t) => (
            <li
              key={t.id}
              className={`flex flex-wrap items-center gap-3 p-4 ${t.hecha ? 'opacity-60' : ''}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  t.hecha
                    ? 'bg-[var(--ingreso)] text-white'
                    : 'border-2 border-border bg-background'
                }`}
              >
                {t.hecha && <Check className="h-4 w-4" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${t.hecha ? 'line-through' : ''}`}>{t.titulo}</p>
                {!t.hecha && (
                  <p className="text-sm text-muted-foreground">{t.descripcion}</p>
                )}
              </div>
              {!t.hecha && (
                <Link href={t.href} className="shrink-0">
                  <Button size="sm" className="rounded-xl">
                    {t.cta}
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

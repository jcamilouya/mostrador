'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { COOKIE_PASOS, DIAS_POSPONER, type Paso } from '@/lib/tareas/pasos';

/**
 * El siguiente paso del negocio: UNA tarjeta, una idea, un botón.
 *
 * Aparece solo cuando el dueño ya está vendiendo de verdad (lo decide el
 * servidor en `getSiguientePaso`), así que no compite con aprender a cobrar.
 *
 * "Ahora no" lo esconde una semana, no para siempre: son cosas que sí le
 * conviene hacer, solo que no hoy. Y desaparece definitivamente cuando la hace,
 * porque cada paso se marca mirando la base de datos, no un botón de "ya lo vi".
 *
 * Posponer va en una COOKIE, no en localStorage. Con localStorage el servidor no
 * sabe qué pospuso, así que la tarjeta tenía que pintarse después de cargar el
 * JavaScript: en un celular lento aparecía tarde y de golpe. Con cookie el
 * servidor ya sabe qué mostrar y la página llega pintada.
 */
export function SiguientePaso({ paso }: { paso: Paso | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (!paso) return null;

  function posponer() {
    if (!paso) return;
    const previos = (document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE_PASOS}=`))
      ?.split('=')[1] ?? '')
      .split(',')
      .filter(Boolean);

    const todos = Array.from(new Set([...previos, paso.id])).join(',');
    const segundos = DIAS_POSPONER * 24 * 60 * 60;
    document.cookie = `${COOKIE_PASOS}=${todos}; path=/; max-age=${segundos}; samesite=lax`;

    // Volver a pedir la página: el servidor ya no lo va a incluir.
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl">
          {paso.emoji}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Siguiente paso
          </p>
          <p className="text-lg font-semibold">{paso.titulo}</p>
          <p className="text-sm text-muted-foreground">{paso.porque}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={paso.href} className="flex-1 sm:flex-none">
          <Button className="h-12 w-full rounded-2xl gap-2 sm:w-auto">
            {paso.cta} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <button
          type="button"
          onClick={posponer}
          className="h-12 rounded-2xl px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}

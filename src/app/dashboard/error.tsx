'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw, House } from 'lucide-react';

/**
 * Cualquier error dentro del dashboard cae aquí. Antes salía la pantalla de
 * Next en inglés con el stack: para el dueño de un restaurante eso es
 * indistinguible de "se dañó la app".
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard]', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-3xl bg-card px-6 py-14 text-center shadow-sm">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
        😵‍💫
      </span>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">Esta pantalla no cargó</h1>
        <p className="text-sm text-muted-foreground">
          Fue un problema nuestro, no tuyo — y tus ventas y tu inventario están a salvo.
          Vuelve a intentarlo; si sigue igual, escríbenos y lo revisamos.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset} className="h-11 rounded-2xl gap-2">
          <RefreshCw className="h-4 w-4" /> Intentar de nuevo
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="h-11 w-full rounded-2xl gap-2">
            <House className="h-4 w-4" /> Ir al inicio
          </Button>
        </Link>
      </div>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Código: {error.digest}
        </p>
      )}
    </div>
  );
}

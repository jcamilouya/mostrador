import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Pantalla sin datos. Una pantalla en blanco no enseña nada: aquí siempre se
 * dice para qué sirve y cuál es el único botón que hay que tocar.
 *
 * Es más barato que un tour y está SIEMPRE, no solo el primer día.
 */
export function EstadoVacio({
  emoji,
  titulo,
  texto,
  cta,
  href,
}: {
  emoji: string;
  titulo: string;
  texto: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-sm">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
        {emoji}
      </span>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold">{titulo}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{texto}</p>
      </div>
      {cta && href && (
        <Link href={href}>
          <Button size="lg" className="h-12 rounded-2xl">
            {cta}
          </Button>
        </Link>
      )}
    </div>
  );
}

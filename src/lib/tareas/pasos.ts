/**
 * Tipos y constantes de "el siguiente paso", en su propio archivo porque los
 * comparten el servidor (que decide cuál mostrar) y el botón "Ahora no" del
 * navegador (que escribe la cookie). `queries.ts` no sirve: arrastra el cliente
 * de Supabase al bundle del navegador.
 */

/** Una sugerencia suelta: lo único que se le propone al dueño en ese momento. */
export type Paso = {
  id: string;
  emoji: string;
  titulo: string;
  porque: string;
  cta: string;
  href: string;
};

/** Qué pasos pospuso, separados por coma. La lee el servidor al pintar. */
export const COOKIE_PASOS = 'mostrador_pasos_pospuestos';

/** "Ahora no" no es "nunca": vuelve a proponerlo en una semana. */
export const DIAS_POSPONER = 7;

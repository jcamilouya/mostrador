/**
 * Reconocer "esa columna todavía no existe" en las respuestas de Supabase.
 *
 * La app se despliega antes de correr las migraciones a propósito: cada query
 * reintenta sin la columna nueva en vez de romperse. Para que eso funcione hay
 * que preguntar por DOS códigos distintos, porque PostgREST responde diferente
 * según la operación:
 *
 *   - SELECT          → `42703`, el error crudo de Postgres.
 *   - INSERT / UPDATE → `PGRST204`, porque PostgREST valida el cuerpo contra su
 *                       propio caché de schema ANTES de mandárselo a Postgres.
 *
 * Mirar solo `42703` dejó el registro de negocios nuevos completamente roto
 * mientras faltara una migración: el reintento sin la columna jamás corría y el
 * dueño veía "No pudimos crear tu negocio. Intenta de nuevo." para siempre.
 */

type ErrorSupabase = { code?: string; message?: string } | null | undefined;

export function faltaColumna(error: ErrorSupabase): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Qué columna es la que falta, para poder soltar SOLO esa y conservar el resto
 * del dato. Sin esto el reintento borraba de paso el tipo de negocio, y un
 * restaurante nuevo quedaba sin saber que era un restaurante.
 */
export function nombreColumnaFaltante(error: ErrorSupabase): string | null {
  if (!faltaColumna(error)) return null;
  const m = error?.message ?? '';
  return (
    // PGRST204: Could not find the 'modo_practica' column of 'empresas' …
    m.match(/'([^']+)' column/)?.[1] ??
    // 42703: column "modo_practica" of relation "empresas" does not exist
    m.match(/column "([^"]+)"/)?.[1] ??
    // 42703: column empresas_1.modo_practica does not exist
    m.match(/column (?:[\w]+\.)?([\w]+) does not exist/)?.[1] ??
    null
  );
}

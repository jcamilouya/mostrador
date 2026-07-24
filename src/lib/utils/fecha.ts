/**
 * Fechas en hora Colombia (America/Bogota = UTC-5 fijo, sin horario de verano).
 * El servidor de Vercel corre en UTC, así que "hoy" y los rangos deben calcularse
 * con este offset para no contar mal las ventas de la noche (7pm–medianoche).
 */
const OFFSET_MS = 5 * 60 * 60 * 1000; // Bogotá está 5h detrás de UTC

/** Fecha 'YYYY-MM-DD' de hoy en hora Colombia. */
export function hoyBogota(): string {
  return new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Inicio del día Colombia (00:00) como timestamp ISO en UTC. */
export function inicioDiaBogotaISO(fecha?: string): string {
  const d = fecha ?? hoyBogota();
  // 00:00 en Colombia = 05:00 UTC de esa misma fecha.
  return `${d}T05:00:00.000Z`;
}

/** Inicio del día siguiente Colombia (fin exclusivo del día) en UTC. */
export function finDiaBogotaISO(fecha?: string): string {
  const siguiente = new Date(inicioDiaBogotaISO(fecha));
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return siguiente.toISOString();
}

/**
 * Modelo del plano del salón. Puro (sin Supabase ni React): lo usan el editor
 * en el navegador y `guardarPlano` en el servidor, para que las dos puntas
 * validen con las MISMAS reglas (dentro de la zona, sin encimarse).
 *
 * Las coordenadas son cuadros de una cuadrícula: x/y es la esquina de arriba a
 * la izquierda, w/h cuántos cuadros ocupa.
 */

export type FormaMesa = 'cuadrada' | 'redonda' | 'larga' | 'butaca';
export type TipoPieza = 'mesa' | 'cocina' | 'barra' | 'banos' | 'entrada' | 'caja' | 'pared';

export type Zona = {
  id: string;
  nombre: string;
  cols: number;
  filas: number;
  orden: number;
};

export type Pieza = {
  id: string;
  zona_id: string;
  tipo: TipoPieza;
  forma: FormaMesa | null;
  nombre: string;
  puestos: number | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Reserva = { nombre: string; en: string; personas: number | null };

/** Una pieza tal como llega de la base, con su reserva si la tiene. */
export type PiezaConReserva = Pieza & { reserva: Reserva | null };

export const FORMAS: Record<FormaMesa, { nombre: string; w: number; h: number; puestos: number }> = {
  cuadrada: { nombre: 'Cuadrada', w: 2, h: 2, puestos: 4 },
  redonda: { nombre: 'Redonda', w: 2, h: 2, puestos: 2 },
  larga: { nombre: 'Larga', w: 3, h: 2, puestos: 6 },
  butaca: { nombre: 'Butaca de barra', w: 1, h: 1, puestos: 1 },
};

export const ELEMENTOS: Record<Exclude<TipoPieza, 'mesa'>, { nombre: string; w: number; h: number }> = {
  cocina: { nombre: 'Cocina', w: 4, h: 3 },
  barra: { nombre: 'Barra', w: 5, h: 1 },
  banos: { nombre: 'Baños', w: 3, h: 2 },
  entrada: { nombre: 'Entrada', w: 3, h: 1 },
  caja: { nombre: 'Caja', w: 2, h: 2 },
  pared: { nombre: 'Pared', w: 4, h: 1 },
};

export const TAMANOS: { nombre: string; cols: number; filas: number }[] = [
  { nombre: 'Pequeño', cols: 12, filas: 8 },
  { nombre: 'Mediano', cols: 14, filas: 9 },
  { nombre: 'Grande', cols: 18, filas: 11 },
  { nombre: 'Muy grande', cols: 22, filas: 13 },
];

/** Límites — iguales a los CHECK de la migración 021. */
export const LIMITES = {
  zonas: 10,
  piezas: 300,
  ladoPieza: 20,
  nombre: 40,
} as const;

/** ¿Se sale de la zona? */
export function fuera(z: Pick<Zona, 'cols' | 'filas'>, p: Pick<Pieza, 'x' | 'y' | 'w' | 'h'>): boolean {
  return p.x < 0 || p.y < 0 || p.x + p.w > z.cols || p.y + p.h > z.filas;
}

/** ¿Se encima con otra pieza de la misma zona? `ignorar` = la que se mueve. */
export function choca(
  piezas: Pieza[],
  zonaId: string,
  p: Pick<Pieza, 'x' | 'y' | 'w' | 'h'>,
  ignorar?: string,
): boolean {
  return piezas.some(
    (o) =>
      o.zona_id === zonaId &&
      o.id !== ignorar &&
      p.x < o.x + o.w &&
      p.x + p.w > o.x &&
      p.y < o.y + o.h &&
      p.y + p.h > o.y,
  );
}

/** Primer espacio libre de w×h en la zona (de arriba a abajo), o null. */
export function hueco(
  z: Zona,
  piezas: Pieza[],
  w: number,
  h: number,
): { x: number; y: number } | null {
  for (let y = 0; y <= z.filas - h; y++) {
    for (let x = 0; x <= z.cols - w; x++) {
      if (!choca(piezas, z.id, { x, y, w, h })) return { x, y };
    }
  }
  return null;
}

/** Normaliza un nombre para comparar ("Mesa 4" = "mesa  4"). */
export function claveNombre(n: string): string {
  return n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Revisa un plano completo. Devuelve el primer problema en palabras del dueño,
 * o null si está bien. El servidor la corre antes de guardar: el navegador no
 * decide qué es válido.
 */
export function validarPlano(zonas: Zona[], piezas: Pieza[]): string | null {
  if (zonas.length === 0) return 'El plano necesita al menos una zona.';
  if (zonas.length > LIMITES.zonas) return `Máximo ${LIMITES.zonas} zonas.`;
  if (piezas.length > LIMITES.piezas) return `Máximo ${LIMITES.piezas} piezas en el plano.`;

  const zonasPorId = new Map(zonas.map((z) => [z.id, z]));
  const nombresZona = new Set<string>();
  for (const z of zonas) {
    const k = claveNombre(z.nombre);
    if (!k) return 'Hay una zona sin nombre.';
    if (nombresZona.has(k)) return `Hay dos zonas que se llaman "${z.nombre}".`;
    nombresZona.add(k);
  }

  const nombresMesa = new Set<string>();
  for (const p of piezas) {
    const z = zonasPorId.get(p.zona_id);
    if (!z) return `"${p.nombre}" quedó en una zona que ya no existe.`;
    if (!p.nombre.trim()) return 'Hay una mesa sin nombre.';
    if (fuera(z, p)) return `"${p.nombre}" se sale de ${z.nombre}. Muévela o agranda la zona.`;
    if (choca(piezas, z.id, p, p.id)) {
      return `"${p.nombre}" está encima de otra cosa en ${z.nombre}.`;
    }
    if (p.tipo === 'mesa') {
      const k = claveNombre(p.nombre);
      if (nombresMesa.has(k)) return `Hay dos mesas que se llaman "${p.nombre}".`;
      nombresMesa.add(k);
    }
  }
  return null;
}

/**
 * Arma un salón de arranque con N mesas cuadradas, cocina, baños y entrada.
 * Primero con pasillos (cada 3 cuadros); si no caben todas, rellena cualquier
 * hueco libre. Devuelve también cuántas cupieron.
 */
export function salonInicial(
  n: number,
  nuevoId: () => string,
): { zona: Zona; piezas: Pieza[]; cupieron: number } {
  // Del tamaño que le corresponde hacia arriba, hasta que quepan todas. Un
  // local de 50 mesas no cabe en "Muy grande": se agranda solo.
  const inicio = n > 20 ? 3 : n > 12 ? 2 : 1;
  const tamanos = [...TAMANOS.slice(inicio), ...EXTRA_GRANDES];
  let ultimo: ReturnType<typeof armarSalon> | null = null;
  for (const t of tamanos) {
    ultimo = armarSalon(n, t.cols, t.filas, nuevoId);
    if (ultimo.cupieron >= n) return ultimo;
  }
  return ultimo!;
}

/** Más allá de "Muy grande", solo para el armado automático (≤ límites de la 021). */
const EXTRA_GRANDES = [
  { cols: 26, filas: 15 },
  { cols: 30, filas: 18 },
  { cols: 36, filas: 22 },
  { cols: 40, filas: 26 },
];

function armarSalon(
  n: number,
  cols: number,
  filas: number,
  nuevoId: () => string,
): { zona: Zona; piezas: Pieza[]; cupieron: number } {
  const zona: Zona = { id: nuevoId(), nombre: 'Salón', cols, filas, orden: 0 };
  const el = (tipo: Exclude<TipoPieza, 'mesa'>, x: number, y: number): Pieza => ({
    id: nuevoId(),
    zona_id: zona.id,
    tipo,
    forma: null,
    nombre: ELEMENTOS[tipo].nombre,
    puestos: null,
    x,
    y,
    w: ELEMENTOS[tipo].w,
    h: ELEMENTOS[tipo].h,
  });
  const piezas: Pieza[] = [
    el('cocina', 0, 0),
    el('banos', 0, zona.filas - ELEMENTOS.banos.h),
    el('entrada', Math.floor(zona.cols / 2) - 1, zona.filas - 1),
  ];

  let i = 0;
  const mesa = (x: number, y: number): Pieza => ({
    id: nuevoId(),
    zona_id: zona.id,
    tipo: 'mesa',
    forma: 'cuadrada',
    nombre: `Mesa ${++i}`,
    puestos: 4,
    x,
    y,
    w: 2,
    h: 2,
  });

  for (let y = 0; y <= zona.filas - 2 && i < n; y += 3) {
    for (let x = 0; x <= zona.cols - 2 && i < n; x += 3) {
      if (!choca(piezas, zona.id, { x, y, w: 2, h: 2 })) piezas.push(mesa(x, y));
    }
  }
  while (i < n) {
    const hp = hueco(zona, piezas, 2, 2);
    if (!hp) break;
    piezas.push(mesa(hp.x, hp.y));
  }
  return { zona, piezas, cupieron: i };
}

// ── Estado de una mesa en el servicio ───────────────────────────────────────

export type EstadoMesa = 'libre' | 'ocupada' | 'por_cobrar' | 'reservada';

export const ESTADOS: Record<EstadoMesa, { nombre: string; color: string }> = {
  libre: { nombre: 'Disponible', color: 'var(--ingreso)' },
  ocupada: { nombre: 'Ocupada', color: 'var(--egreso)' },
  por_cobrar: { nombre: 'Por cobrar', color: 'var(--utilidad)' },
  reservada: { nombre: 'Reservada', color: 'var(--reservada)' },
};

/** Una reserva se deja de mostrar 1 h después de su hora (nadie llegó). */
export const GRACIA_RESERVA_MS = 60 * 60 * 1000;

export function reservaVigente(r: Reserva | null, ahora = Date.now()): boolean {
  if (!r) return false;
  const t = new Date(r.en).getTime();
  return Number.isFinite(t) && ahora < t + GRACIA_RESERVA_MS;
}

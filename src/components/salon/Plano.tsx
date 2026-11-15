'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Banknote, Bath, BrickWall, ChefHat, DoorOpen, Wine, type LucideIcon } from 'lucide-react';
import { choca, ESTADOS, type EstadoMesa, type Pieza, type TipoPieza, type Zona } from '@/lib/salon/modelo';
import { formatCOP } from '@/lib/utils/format';

const ICONOS: Record<Exclude<TipoPieza, 'mesa'>, LucideIcon> = {
  cocina: ChefHat,
  barra: Wine,
  banos: Bath,
  entrada: DoorOpen,
  caja: Banknote,
  pared: BrickWall,
};

/** Cómo va la mesa en el servicio. */
export type InfoMesa = {
  estado: EstadoMesa;
  total?: number;
  minutos?: number;
};

/** "Mesa 4" → "4"; "Terraza 2" → "T2"; lo demás tal cual (se recorta con CSS). */
export function nombreCorto(nombre: string): string {
  const mesa = nombre.match(/^mesa\s*(\d+)$/i);
  if (mesa) return mesa[1];
  const otra = nombre.match(/^(\S)\S*\s+(\d+)$/);
  if (otra) return `${otra[1].toUpperCase()}${otra[2]}`;
  return nombre;
}

function textoMinutos(min: number): string {
  if (min < 1) return 'recién';
  if (min < 60) return `${min} min`;
  if (min >= 12 * 60) return 'desde ayer';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

type Arrastre = { id: string; x: number; y: number; valido: boolean };

/**
 * Dibuja UNA zona del salón. Dos modos:
 *  - Servicio: cada mesa es un botón con el color de su estado.
 *  - Editor (`editable`): las piezas se arrastran por la cuadrícula; si caen
 *    encima de otra o afuera, se marcan en rojo y vuelven a su sitio.
 *
 * Con zonas grandes el plano tiene un ancho mínimo (cada cuadro ≥ 26 px) y se
 * desplaza de lado en el celular, para que ninguna mesa quede imposible de
 * tocar con el dedo.
 */
export function Plano({
  zona,
  piezas,
  infoMesa,
  onTocarMesa,
  elegibles,
  editable = false,
  seleccion = null,
  onSeleccionar,
  onMover,
}: {
  zona: Zona;
  /** Todas las piezas del plano (se filtran por zona aquí). */
  piezas: Pieza[];
  infoMesa?: (id: string) => InfoMesa;
  onTocarMesa?: (p: Pieza) => void;
  /** Modo "elige a dónde": solo estas mesas se pueden tocar. */
  elegibles?: Set<string> | null;
  editable?: boolean;
  seleccion?: string | null;
  onSeleccionar?: (id: string | null) => void;
  onMover?: (id: string, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const inicio = useRef<{ id: string; px: number; py: number; x0: number; y0: number; movio: boolean } | null>(
    null,
  );

  const deZona = piezas.filter((p) => p.zona_id === zona.id);

  function poner(a: Arrastre | null) {
    arrastreRef.current = a;
    setArrastre(a);
  }

  function alBajar(e: PointerEvent<HTMLElement>, p: Pieza) {
    if (!editable) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores no la permiten; el arrastre funciona igual */
    }
    inicio.current = { id: p.id, px: e.clientX, py: e.clientY, x0: p.x, y0: p.y, movio: false };
  }

  function alMover(e: PointerEvent<HTMLElement>, p: Pieza) {
    const ini = inicio.current;
    if (!editable || !ini || ini.id !== p.id || !ref.current) return;
    const ancho = ref.current.getBoundingClientRect().width;
    const celda = ancho > 0 ? ancho / zona.cols : 1;
    const dx = Math.round((e.clientX - ini.px) / celda);
    const dy = Math.round((e.clientY - ini.py) / celda);
    if (!ini.movio && dx === 0 && dy === 0) return;
    ini.movio = true;
    const x = Math.min(Math.max(ini.x0 + dx, 0), zona.cols - p.w);
    const y = Math.min(Math.max(ini.y0 + dy, 0), zona.filas - p.h);
    const valido = !choca(piezas, zona.id, { x, y, w: p.w, h: p.h }, p.id);
    poner({ id: p.id, x, y, valido });
  }

  function alSoltar(p: Pieza) {
    const ini = inicio.current;
    inicio.current = null;
    if (!editable || !ini) return;
    const a = arrastreRef.current;
    poner(null);
    if (!ini.movio) {
      onSeleccionar?.(seleccion === p.id ? null : p.id);
      return;
    }
    if (a && a.valido && (a.x !== p.x || a.y !== p.y)) onMover?.(p.id, a.x, a.y);
    onSeleccionar?.(p.id);
  }

  function alCancelar() {
    inicio.current = null;
    poner(null);
  }

  /** Flechas del teclado mueven la pieza elegida un cuadro. */
  function alTecla(e: KeyboardEvent<HTMLElement>, p: Pieza) {
    if (!editable) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const x = p.x + d[0];
    const y = p.y + d[1];
    if (x < 0 || y < 0 || x + p.w > zona.cols || y + p.h > zona.filas) return;
    if (choca(piezas, zona.id, { x, y, w: p.w, h: p.h }, p.id)) return;
    onMover?.(p.id, x, y);
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        ref={ref}
        className="relative mx-auto w-full select-none rounded-3xl border border-border bg-card"
        style={{
          aspectRatio: `${zona.cols} / ${zona.filas}`,
          minWidth: `${zona.cols * 26}px`,
          // En el computador el plano entero cabe en la pantalla sin bajar:
          // el ancho se limita a lo que permite el alto disponible.
          maxWidth: `max(${zona.cols * 26}px, calc((100dvh - 15rem) * ${zona.cols} / ${zona.filas}))`,
          // Cuadrícula de puntos: solo se ve al editar, para ubicar las piezas.
          backgroundImage: editable
            ? 'radial-gradient(circle, var(--border) 1.2px, transparent 1.3px)'
            : undefined,
          backgroundSize: editable ? `${100 / zona.cols}% ${100 / zona.filas}%` : undefined,
          backgroundPosition: editable ? `${50 / zona.cols}% ${50 / zona.filas}%` : undefined,
        }}
        onPointerDown={(e) => {
          if (editable && e.target === e.currentTarget) onSeleccionar?.(null);
        }}
      >
        {deZona.map((p) => {
          const a = arrastre?.id === p.id ? arrastre : null;
          const x = a ? a.x : p.x;
          const y = a ? a.y : p.y;
          const elegida = seleccion === p.id;
          const caja = {
            left: pct(x, zona.cols),
            top: pct(y, zona.filas),
            width: pct(p.w, zona.cols),
            height: pct(p.h, zona.filas),
          };
          const comunes = {
            onPointerDown: (e: PointerEvent<HTMLElement>) => alBajar(e, p),
            onPointerMove: (e: PointerEvent<HTMLElement>) => alMover(e, p),
            onPointerUp: () => alSoltar(p),
            onPointerCancel: alCancelar,
            onKeyDown: (e: KeyboardEvent<HTMLElement>) => alTecla(e, p),
            // Enter/espacio con teclado (detail 0) eligen la pieza; con el
            // dedo o el mouse eso ya lo hizo alSoltar.
            onClick: (e: { detail: number }) => {
              if (e.detail === 0) onSeleccionar?.(seleccion === p.id ? null : p.id);
            },
          };

          // ── Espacios fijos: cocina, barra, baños… ──
          if (p.tipo !== 'mesa') {
            const Icono = ICONOS[p.tipo];
            const contenido = (
              <span
                className={`@container flex h-full w-full items-center justify-center gap-1 overflow-hidden rounded-[min(0.75rem,20%)] border border-dashed text-muted-foreground ${
                  p.tipo === 'pared' ? 'border-transparent bg-foreground/15' : 'border-border bg-secondary/70'
                } ${a && !a.valido ? 'border-solid border-[var(--egreso)] bg-[var(--egreso)]/15' : ''}`}
              >
                <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden truncate text-[11px] font-medium @[4.5rem]:inline">{p.nombre}</span>
              </span>
            );
            return editable ? (
              <button
                key={p.id}
                type="button"
                aria-label={`${p.nombre}. Arrastra para mover`}
                aria-pressed={elegida}
                className={`absolute touch-none p-[3px] outline-none ${a ? 'z-20 cursor-grabbing opacity-90' : 'cursor-grab'} ${
                  elegida ? 'z-10 [&>span]:ring-2 [&>span]:ring-foreground' : ''
                }`}
                style={caja}
                {...comunes}
              >
                {contenido}
              </button>
            ) : (
              <div key={p.id} className="pointer-events-none absolute p-[3px]" style={caja} aria-hidden>
                {contenido}
              </div>
            );
          }

          // ── Mesas ──
          const info = !editable && infoMesa ? infoMesa(p.id) : null;
          const estado = info?.estado ?? 'libre';
          const color = editable ? 'var(--muted-foreground)' : ESTADOS[estado].color;
          const redonda = p.forma === 'redonda' || p.forma === 'butaca';
          const bloqueada = Boolean(elegibles && !elegibles.has(p.id));
          const corto = nombreCorto(p.nombre);

          const etiqueta = editable
            ? `${p.nombre}, ${p.puestos ?? ''} puestos. Arrastra para mover`
            : `${p.nombre}, ${ESTADOS[estado].nombre}${info?.total ? `, ${formatCOP(info.total)}` : ''}`;

          return (
            <button
              key={p.id}
              type="button"
              aria-label={etiqueta}
              aria-pressed={editable ? elegida : undefined}
              disabled={bloqueada}
              className={`absolute p-[3px] outline-none transition-opacity focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring ${
                editable ? `touch-none ${a ? 'z-20 cursor-grabbing' : 'cursor-grab'}` : 'active:scale-[0.97]'
              } ${bloqueada ? 'opacity-30' : ''} ${elegida ? 'z-10' : ''}`}
              style={caja}
              {...(editable ? comunes : {})}
              onClick={editable ? comunes.onClick : () => onTocarMesa?.(p)}
            >
              <span
                className={`@container relative flex h-full w-full flex-col items-center justify-center overflow-hidden border-2 text-foreground shadow-sm ${
                  // Esquina proporcional: con un radio fijo, una mesa
                  // cuadrada chica (celular) se veía igual a una redonda.
                  redonda ? 'rounded-full' : 'rounded-[min(1rem,20%)]'
                } ${elegida ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''} ${
                  a && !a.valido ? 'border-dashed' : ''
                }`}
                style={{
                  borderColor: a && !a.valido ? 'var(--egreso)' : color,
                  background: `color-mix(in oklch, ${a && !a.valido ? 'var(--egreso)' : color} ${
                    editable ? 10 : estado === 'libre' ? 10 : 20
                  }%, var(--card))`,
                }}
              >
                {/* Nombre: corto cuando la mesa es chica, completo cuando cabe */}
                <span className="max-w-full truncate px-1 text-sm font-semibold leading-none @[5.5rem]:hidden">
                  {corto}
                </span>
                <span className="hidden max-w-full truncate px-1.5 text-sm font-semibold leading-tight @[5.5rem]:block">
                  {p.nombre}
                </span>

                {editable ? (
                  <span className="mt-0.5 hidden text-[10px] text-muted-foreground @[3.5rem]:block">
                    {p.puestos} puestos
                  </span>
                ) : (
                  info &&
                  info.total != null && (
                    <span className="mt-0.5 hidden max-w-full truncate px-1 text-[11px] font-medium tabular-nums @[4rem]:block">
                      {formatCOP(info.total)}
                    </span>
                  )
                )}
                {!editable && info?.minutos != null && (
                  <span className="hidden text-[10px] text-muted-foreground @[4rem]:block">
                    {textoMinutos(info.minutos)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Loader2,
  Minus,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { guardarPlano } from '@/lib/salon/actions';
import {
  choca,
  claveNombre,
  ELEMENTOS,
  FORMAS,
  hueco,
  LIMITES,
  TAMANOS,
  validarPlano,
  type FormaMesa,
  type Pieza,
  type TipoPieza,
  type Zona,
} from '@/lib/salon/modelo';
import { Plano } from './Plano';

/**
 * UUID v4 también en http:// (probar desde el celular en la red local):
 * `crypto.randomUUID` solo existe en contextos seguros, `getRandomValues` en
 * todos.
 */
export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Siguiente nombre libre: "Mesa 9", "Terraza 3", "Butaca 2"… */
function siguienteNombre(prefijo: string, piezas: Pieza[]): string {
  const usados = new Set(piezas.filter((p) => p.tipo === 'mesa').map((p) => claveNombre(p.nombre)));
  let n = 1;
  while (usados.has(claveNombre(`${prefijo} ${n}`))) n++;
  return `${prefijo} ${n}`;
}

export function EditorSalon({
  inicial,
  ocupadas,
  onCancelar,
  onGuardado,
}: {
  inicial: { zonas: Zona[]; piezas: Pieza[] };
  /** Mesas con cuenta abierta: no se pueden quitar. */
  ocupadas: Set<string>;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [zonas, setZonas] = useState<Zona[]>(inicial.zonas);
  const [piezas, setPiezas] = useState<Pieza[]>(inicial.piezas);
  const [zonaId, setZonaId] = useState<string>(inicial.zonas[0]?.id ?? '');
  const [sel, setSel] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const zona = zonas.find((z) => z.id === zonaId) ?? zonas[0];
  const pieza = piezas.find((p) => p.id === sel) ?? null;
  const cambio = useMemo(
    () => JSON.stringify({ zonas, piezas }) !== JSON.stringify(inicial),
    [zonas, piezas, inicial],
  );

  // ── Piezas ──

  function agregarMesa(forma: FormaMesa) {
    if (!zona) return;
    if (piezas.length >= LIMITES.piezas) return toast.error(`Máximo ${LIMITES.piezas} piezas.`);
    const f = FORMAS[forma];
    const hp = hueco(zona, piezas, f.w, f.h);
    if (!hp) return toast.error('No hay espacio. Agranda la zona o mueve algo.');
    const prefijo =
      forma === 'butaca' ? 'Butaca' : zona.id === zonas[0]?.id ? 'Mesa' : zona.nombre.split(' ')[0] || 'Mesa';
    const p: Pieza = {
      id: nuevoId(),
      zona_id: zona.id,
      tipo: 'mesa',
      forma,
      nombre: siguienteNombre(prefijo, piezas),
      puestos: f.puestos,
      x: hp.x,
      y: hp.y,
      w: f.w,
      h: f.h,
    };
    setPiezas((ps) => [...ps, p]);
    setSel(p.id);
    toast(`${p.nombre} agregada. Arrástrala a su sitio.`);
  }

  function agregarElemento(tipo: Exclude<TipoPieza, 'mesa'>) {
    if (!zona) return;
    if (piezas.length >= LIMITES.piezas) return toast.error(`Máximo ${LIMITES.piezas} piezas.`);
    const e = ELEMENTOS[tipo];
    let w = e.w;
    let h = e.h;
    let hp = hueco(zona, piezas, w, h);
    if (!hp) {
      w = Math.min(w, 2);
      h = 1;
      hp = hueco(zona, piezas, w, h);
    }
    if (!hp) return toast.error('No hay espacio. Agranda la zona o mueve algo.');
    const p: Pieza = {
      id: nuevoId(),
      zona_id: zona.id,
      tipo,
      forma: null,
      nombre: e.nombre,
      puestos: null,
      x: hp.x,
      y: hp.y,
      w,
      h,
    };
    setPiezas((ps) => [...ps, p]);
    setSel(p.id);
  }

  function mover(id: string, x: number, y: number) {
    setPiezas((ps) => ps.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }

  /** Cambia el tamaño si cabe; si no, avisa y no toca nada. */
  function redimensionar(p: Pieza, w: number, h: number) {
    if (!zona) return;
    if (w < 1 || h < 1 || w > LIMITES.ladoPieza || h > LIMITES.ladoPieza) return;
    const nueva = { ...p, w, h };
    if (nueva.x + w > zona.cols || nueva.y + h > zona.filas || choca(piezas, zona.id, nueva, p.id)) {
      toast.error('No cabe así. Muévela a un espacio más amplio primero.');
      return;
    }
    setPiezas((ps) => ps.map((x) => (x.id === p.id ? nueva : x)));
  }

  function actualizar(id: string, cambios: Partial<Pieza>) {
    setPiezas((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  function quitar(p: Pieza) {
    if (ocupadas.has(p.id)) {
      toast.error(`${p.nombre} tiene una cuenta abierta. Cóbrala o cámbiala de mesa antes de quitarla.`);
      return;
    }
    setPiezas((ps) => ps.filter((x) => x.id !== p.id));
    setSel(null);
  }

  // ── Zonas ──

  function agregarZona() {
    if (zonas.length >= LIMITES.zonas) return toast.error(`Máximo ${LIMITES.zonas} zonas.`);
    const usados = new Set(zonas.map((z) => claveNombre(z.nombre)));
    const sugerencias = ['Terraza', 'Segundo piso', 'Barra', 'Patio', 'VIP'];
    let nombre = sugerencias.find((s) => !usados.has(claveNombre(s)));
    for (let n = 2; !nombre; n++) if (!usados.has(claveNombre(`Zona ${n}`))) nombre = `Zona ${n}`;
    const z: Zona = { id: nuevoId(), nombre, cols: TAMANOS[1].cols, filas: TAMANOS[1].filas, orden: zonas.length };
    setZonas((zs) => [...zs, z]);
    setZonaId(z.id);
    setSel(null);
  }

  function cambiarTamano(cols: number, filas: number) {
    if (!zona) return;
    const afuera = piezas.find(
      (p) => p.zona_id === zona.id && (p.x + p.w > cols || p.y + p.h > filas),
    );
    if (afuera) {
      toast.error(`"${afuera.nombre}" quedaría afuera. Muévela hacia arriba a la izquierda primero.`);
      return;
    }
    setZonas((zs) => zs.map((z) => (z.id === zona.id ? { ...z, cols, filas } : z)));
  }

  function quitarZona() {
    if (!zona) return;
    if (zonas.length === 1) return toast.error('El plano necesita al menos una zona.');
    const suyas = piezas.filter((p) => p.zona_id === zona.id);
    const conCuenta = suyas.find((p) => ocupadas.has(p.id));
    if (conCuenta) {
      return toast.error(`${conCuenta.nombre} tiene una cuenta abierta. Cóbrala o muévela primero.`);
    }
    if (suyas.length > 0 && !confirm(`¿Quitar "${zona.nombre}" con sus ${suyas.length} piezas?`)) return;
    const resto = zonas.filter((z) => z.id !== zona.id);
    setPiezas((ps) => ps.filter((p) => p.zona_id !== zona.id));
    setZonas(resto);
    setZonaId(resto[0].id);
    setSel(null);
  }

  // ── Guardar ──

  function guardar() {
    const limpias = {
      zonas: zonas.map((z, i) => ({ ...z, nombre: z.nombre.trim(), orden: i })),
      piezas: piezas.map((p) => ({ ...p, nombre: p.nombre.trim() })),
    };
    const problema = validarPlano(limpias.zonas, limpias.piezas);
    if (problema) {
      toast.error(problema);
      return;
    }
    startGuardar(async () => {
      try {
        const res = await guardarPlano(limpias);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success('Plano guardado');
        onGuardado();
      } catch {
        toast.error('No pudimos guardar. Revisa tu internet e inténtalo de nuevo.');
      }
    });
  }

  function cancelar() {
    if (cambio && !confirm('¿Salir sin guardar los cambios del plano?')) return;
    onCancelar();
  }

  if (!zona) return null;
  const tamActual = TAMANOS.findIndex((t) => t.cols === zona.cols && t.filas === zona.filas);
  const mesasEnPlano = piezas.filter((p) => p.tipo === 'mesa').length;

  return (
    <div className="space-y-4">
      {/* Barra fija: cancelar / guardar */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Editando el plano</p>
          <p className="truncate text-xs text-muted-foreground">
            {mesasEnPlano} {mesasEnPlano === 1 ? 'mesa' : 'mesas'} · arrastra para acomodar
          </p>
        </div>
        <Button variant="outline" className="h-10 rounded-xl" onClick={cancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button className="h-10 rounded-xl gap-1.5" onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </Button>
      </div>

      {/* Zonas */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {zonas.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => {
              setZonaId(z.id);
              setSel(null);
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              z.id === zona.id ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {z.nombre || 'Sin nombre'}
          </button>
        ))}
        <button
          type="button"
          onClick={agregarZona}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Zona
        </button>
      </div>

      {/* Herramientas: o lo que se puede agregar, o la pieza elegida */}
      <div className="rounded-3xl bg-card p-4 shadow-sm">
        {pieza ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={pieza.nombre}
                maxLength={LIMITES.nombre}
                onChange={(e) => actualizar(pieza.id, { nombre: e.target.value })}
                className="h-11 flex-1 rounded-xl text-base font-semibold"
                aria-label="Nombre"
              />
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSel(null)}>
                Listo
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pieza.tipo === 'mesa' && (
                <Paso
                  etiqueta="Puestos"
                  valor={pieza.puestos ?? 1}
                  min={1}
                  max={40}
                  onCambiar={(v) => actualizar(pieza.id, { puestos: v })}
                />
              )}
              {pieza.forma !== 'butaca' && pieza.forma !== 'redonda' && (
                <>
                  <Paso etiqueta="Ancho" valor={pieza.w} min={1} max={LIMITES.ladoPieza} onCambiar={(v) => redimensionar(pieza, v, pieza.h)} />
                  <Paso etiqueta="Alto" valor={pieza.h} min={1} max={LIMITES.ladoPieza} onCambiar={(v) => redimensionar(pieza, pieza.w, v)} />
                </>
              )}
              {pieza.w !== pieza.h && (
                <Button variant="outline" className="h-10 rounded-xl gap-1.5" onClick={() => redimensionar(pieza, pieza.h, pieza.w)}>
                  <RotateCw className="h-4 w-4" /> Girar
                </Button>
              )}
              <Button
                variant="outline"
                className="ml-auto h-10 rounded-xl gap-1.5 text-[var(--egreso)] hover:text-[var(--egreso)]"
                onClick={() => quitar(pieza)}
              >
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Agregar mesa</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FORMAS) as FormaMesa[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => agregarMesa(f)}
                    className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/70"
                  >
                    <FormaIcono forma={f} />
                    {FORMAS[f].nombre}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Agregar espacio</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ELEMENTOS) as Exclude<TipoPieza, 'mesa'>[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => agregarElemento(t)}
                    className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {ELEMENTOS[t].nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <Plano
        zona={zona}
        piezas={piezas}
        editable
        seleccion={sel}
        onSeleccionar={setSel}
        onMover={mover}
      />

      {/* Ajustes de la zona */}
      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-card p-4 shadow-sm">
        <label className="min-w-40 flex-1 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nombre de la zona</span>
          <Input
            value={zona.nombre}
            maxLength={LIMITES.nombre}
            onChange={(e) =>
              setZonas((zs) => zs.map((z) => (z.id === zona.id ? { ...z, nombre: e.target.value } : z)))
            }
            className="h-10 rounded-xl"
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Tamaño</span>
          <div className="flex flex-wrap gap-1.5">
            {TAMANOS.map((t, i) => (
              <button
                key={t.nombre}
                type="button"
                onClick={() => cambiarTamano(t.cols, t.filas)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  i === tamActual ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          className="h-10 rounded-xl gap-1.5 text-muted-foreground hover:text-[var(--egreso)]"
          onClick={quitarZona}
          disabled={zonas.length === 1}
        >
          <X className="h-4 w-4" /> Quitar zona
        </Button>
      </div>
    </div>
  );
}

function Paso({
  etiqueta,
  valor,
  min,
  max,
  onCambiar,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  onCambiar: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-secondary px-1.5 py-1">
      <span className="px-1.5 text-xs text-muted-foreground">{etiqueta}</span>
      <button
        type="button"
        aria-label={`Menos ${etiqueta.toLowerCase()}`}
        disabled={valor <= min}
        onClick={() => onCambiar(valor - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-background disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{valor}</span>
      <button
        type="button"
        aria-label={`Más ${etiqueta.toLowerCase()}`}
        disabled={valor >= max}
        onClick={() => onCambiar(valor + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-background disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FormaIcono({ forma }: { forma: FormaMesa }) {
  const cls = 'inline-block border-2 border-current opacity-70';
  if (forma === 'redonda') return <span className={`${cls} h-4 w-4 rounded-full`} />;
  if (forma === 'butaca') return <span className={`${cls} h-2.5 w-2.5 rounded-full`} />;
  if (forma === 'larga') return <span className={`${cls} h-3.5 w-6 rounded-[5px]`} />;
  return <span className={`${cls} h-4 w-4 rounded-[5px]`} />;
}

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LayoutGrid, List, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { anularCuenta } from '@/lib/mesas/actions';
import { juntarCuentas, moverCuenta, pedirCuenta, quitarReserva, reservarMesa } from '@/lib/salon/actions';
import {
  claveNombre,
  ESTADOS,
  reservaVigente,
  salonInicial,
  TAMANOS,
  type EstadoMesa,
  type Pieza,
  type PiezaConReserva,
  type Zona,
} from '@/lib/salon/modelo';
import type { CuentaAbierta } from '@/lib/mesas/queries';
import { lineasParaCarrito } from '@/lib/mesas/carrito';
import { huellaCuenta } from '@/lib/mesas/huella';
import { useCart } from '@/stores/cart-store';
import { formatCOP } from '@/lib/utils/format';
import { MesasManager } from '@/components/mesas/MesasManager';
import { Plano, type InfoMesa } from './Plano';
import { PanelMesa } from './PanelMesa';
import { EditorSalon, nuevoId } from './EditorSalon';

type Elegir = { tipo: 'mover' | 'juntar'; cuenta: CuentaAbierta; origen: PiezaConReserva };
type Filtro = 'todas' | EstadoMesa;

const CLAVE_VISTA = 'mostrador.salon.vista';

/** Quita la reserva de una pieza, para el editor (que no maneja reservas). */
function sinReserva(p: PiezaConReserva): Pieza {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reserva, ...resto } = p;
  return resto;
}

export function Salon({
  zonas,
  piezas,
  cuentas,
  generadoEn,
}: {
  zonas: Zona[];
  piezas: PiezaConReserva[];
  cuentas: CuentaAbierta[];
  /** Hora del servidor al pintar: así servidor y navegador calculan igual. */
  generadoEn: number;
}) {
  const router = useRouter();
  const prepararMesa = useCart((s) => s.prepararMesa);
  const cargarCuenta = useCart((s) => s.cargarCuenta);

  const [ahora, setAhora] = useState(generadoEn);
  const [vista, setVista] = useState<'plano' | 'lista'>('plano');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [zonaId, setZonaId] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [elegir, setElegir] = useState<Elegir | null>(null);
  const [editor, setEditor] = useState<{ zonas: Zona[]; piezas: Pieza[] } | null>(null);
  const [ocupado, startAccion] = useTransition();

  // Reloj: los minutos de cada mesa avanzan solos.
  useEffect(() => {
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Plano o lista: se recuerda en este equipo (el mesero prefiere lista).
  useEffect(() => {
    try {
      const v = localStorage.getItem(CLAVE_VISTA);
      if (v === 'plano' || v === 'lista') setVista(v);
    } catch {
      /* sin almacenamiento: queda en plano */
    }
  }, []);
  function cambiarVista(v: 'plano' | 'lista') {
    setVista(v);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      /* no importa */
    }
  }

  const mesas = useMemo(() => piezas.filter((p) => p.tipo === 'mesa'), [piezas]);
  const zonaNombre = useMemo(() => new Map(zonas.map((z) => [z.id, z.nombre])), [zonas]);

  /**
   * Qué cuenta tiene cada mesa. Primero las amarradas por `mesa_id`; después
   * las viejas (de antes del plano) cuyo nombre coincide con una mesa libre,
   * para que "Mesa 4" abierta ayer aparezca en la Mesa 4 del dibujo. El resto
   * (para llevar, domicilio, nombres libres) va aparte.
   */
  const { cuentaDe, otras } = useMemo(() => {
    const porMesa = new Map<string, CuentaAbierta>();
    const idsMesa = new Set(mesas.map((m) => m.id));
    const sueltas: CuentaAbierta[] = [];
    for (const c of cuentas) {
      if (c.mesaId && idsMesa.has(c.mesaId) && !porMesa.has(c.mesaId)) porMesa.set(c.mesaId, c);
      else sueltas.push(c);
    }
    const porNombre = new Map(mesas.map((m) => [claveNombre(m.nombre), m.id]));
    const resto: CuentaAbierta[] = [];
    for (const c of sueltas) {
      const id = c.mesaId ? null : porNombre.get(claveNombre(c.mesa));
      if (id && !porMesa.has(id)) porMesa.set(id, c);
      else resto.push(c);
    }
    return { cuentaDe: porMesa, otras: resto };
  }, [cuentas, mesas]);

  function estadoDe(p: PiezaConReserva): EstadoMesa {
    const c = cuentaDe.get(p.id);
    if (c) return c.pedidaEn ? 'por_cobrar' : 'ocupada';
    return reservaVigente(p.reserva, ahora) ? 'reservada' : 'libre';
  }

  function infoMesa(id: string): InfoMesa {
    const p = mesas.find((m) => m.id === id);
    if (!p) return { estado: 'libre' };
    const c = cuentaDe.get(id);
    return {
      estado: estadoDe(p),
      total: c?.total,
      minutos: c
        ? Math.max(0, Math.floor((ahora - new Date(c.abiertaDesde).getTime()) / 60000))
        : undefined,
    };
  }

  const conteo = useMemo(() => {
    const n: Record<EstadoMesa, number> = { libre: 0, ocupada: 0, por_cobrar: 0, reservada: 0 };
    for (const m of mesas) n[estadoDe(m)]++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesas, cuentaDe, ahora]);

  // ── Editor ──

  if (editor) {
    return (
      <EditorSalon
        inicial={editor}
        ocupadas={new Set(cuentaDe.keys())}
        onCancelar={() => setEditor(null)}
        onGuardado={() => {
          setEditor(null);
          setZonaId(null);
          router.refresh();
        }}
      />
    );
  }

  // ── Sin plano todavía ──

  if (zonas.length === 0) {
    return (
      <div className="space-y-6">
        <CrearSalon
          onCrear={(n) => {
            const s = salonInicial(n, nuevoId);
            if (s.cupieron < n) toast(`Cupieron ${s.cupieron}. Agranda la zona para el resto.`);
            setEditor({ zonas: [s.zona], piezas: s.piezas });
          }}
          onVacio={() =>
            setEditor({
              zonas: [{ id: nuevoId(), nombre: 'Salón', cols: TAMANOS[1].cols, filas: TAMANOS[1].filas, orden: 0 }],
              piezas: [],
            })
          }
        />
        {cuentas.length > 0 && <MesasManager cuentas={cuentas} />}
      </div>
    );
  }

  // ── Servicio ──

  const zona = zonas.find((z) => z.id === zonaId) ?? zonas[0];
  const piezaAbierta = mesas.find((m) => m.id === abierta) ?? null;

  const elegibles = elegir
    ? new Set(
        mesas
          .filter((m) => m.id !== elegir.origen.id)
          .filter((m) => (elegir.tipo === 'mover' ? !cuentaDe.has(m.id) : cuentaDe.has(m.id)))
          .map((m) => m.id),
      )
    : null;

  function ir(destino: string) {
    router.push(destino);
  }

  function tocarMesa(p: Pieza) {
    if (elegir) return elegirDestino(p);
    setAbierta(p.id);
  }

  function elegirDestino(p: Pieza) {
    if (!elegir) return;
    const { tipo, cuenta, origen } = elegir;
    if (tipo === 'mover') {
      startAccion(async () => {
        const res = await moverCuenta(cuenta.id, p.id);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${origen.nombre} pasó a ${p.nombre}`);
        setElegir(null);
        router.refresh();
      });
      return;
    }
    const otra = cuentaDe.get(p.id);
    if (!otra) return;
    if (!confirm(`¿Juntar ${origen.nombre} con ${p.nombre}? Queda una sola cuenta en ${p.nombre}.`)) return;
    startAccion(async () => {
      const res = await juntarCuentas(cuenta.id, otra.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${origen.nombre} se juntó con ${p.nombre}`);
      setElegir(null);
      router.refresh();
    });
  }

  function accionesDe(p: PiezaConReserva) {
    const cuenta = cuentaDe.get(p.id) ?? null;
    const llevarAlPOS = (cobrar: boolean) => {
      if (!cuenta) return;
      cargarCuenta({
        id: cuenta.id,
        mesa: p.nombre,
        mesaId: p.id,
        cliente: cuenta.cliente,
        items: lineasParaCarrito(cuenta),
        huella: huellaCuenta(cuenta.items),
        cobrar,
      });
      ir('/dashboard/pos');
    };
    const correr = (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string, cerrar = true) =>
      startAccion(async () => {
        const res = await fn();
        if (!res.ok) return void toast.error(res.error ?? 'No se pudo');
        toast.success(exito);
        if (cerrar) setAbierta(null);
        router.refresh();
      });

    return {
      tomarPedido: () => {
        prepararMesa({ id: p.id, nombre: p.nombre });
        ir('/dashboard/pos');
      },
      agregar: () => llevarAlPOS(false),
      cobrar: () => llevarAlPOS(true),
      pedirCuenta: (pedir: boolean) =>
        cuenta &&
        correr(
          () => pedirCuenta(cuenta.id, pedir),
          pedir ? `${p.nombre} pidió la cuenta` : `${p.nombre} sigue consumiendo`,
        ),
      mover: () => {
        if (!cuenta) return;
        setAbierta(null);
        setElegir({ tipo: 'mover', cuenta, origen: p });
      },
      juntar: () => {
        if (!cuenta) return;
        setAbierta(null);
        setElegir({ tipo: 'juntar', cuenta, origen: p });
      },
      anular: () => {
        if (!cuenta) return;
        if (!confirm(`¿Anular la cuenta de ${p.nombre}? No se cobrará nada.`)) return;
        correr(() => anularCuenta(cuenta.id), `Cuenta de ${p.nombre} anulada`);
      },
      reservar: (r: { nombre: string; en: string; personas: number | null }) =>
        correr(() => reservarMesa({ mesa_id: p.id, ...r }), `${p.nombre} reservada para ${r.nombre}`),
      quitarReserva: () => correr(() => quitarReserva(p.id), 'Reserva quitada'),
    };
  }

  const vacias = {
    tomarPedido: () => {},
    agregar: () => {},
    cobrar: () => {},
    pedirCuenta: () => {},
    mover: () => {},
    juntar: () => {},
    anular: () => {},
    reservar: () => {},
    quitarReserva: () => {},
  };

  const listaMesas = mesas
    .filter((m) => filtro === 'todas' || estadoDe(m) === filtro)
    .sort((a, b) => {
      const za = zonas.findIndex((z) => z.id === a.zona_id);
      const zb = zonas.findIndex((z) => z.id === b.zona_id);
      return za - zb || a.nombre.localeCompare(b.nombre, 'es', { numeric: true });
    });

  return (
    <div className="space-y-4">
      {/* Resumen en una línea + herramientas */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {(Object.keys(ESTADOS) as EstadoMesa[]).map((e) => {
            const activo = filtro === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setFiltro(activo ? 'todas' : e)}
                aria-pressed={activo}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  activo ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: ESTADOS[e].color }} />
                <span className="tabular-nums">{conteo[e]}</span> {ESTADOS[e].nombre.toLowerCase()}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-xl bg-secondary p-0.5">
            {(['plano', 'lista'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => cambiarVista(v)}
                aria-pressed={vista === v}
                aria-label={v === 'plano' ? 'Ver plano' : 'Ver lista'}
                className={`flex h-8 w-9 items-center justify-center rounded-[10px] ${
                  vista === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {v === 'plano' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-xl gap-1.5"
            onClick={() => {
              setAbierta(null);
              setElegir(null);
              setEditor({ zonas, piezas: piezas.map(sinReserva) });
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editar plano</span>
          </Button>
        </div>
      </div>

      {/* Modo "toca a dónde" para cambiar o juntar */}
      {elegir && (
        <div className="flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background">
          <p className="flex-1 text-sm font-medium">
            {elegir.tipo === 'mover'
              ? `Toca la mesa libre a donde pasa ${elegir.origen.nombre}`
              : `Toca la mesa ocupada con la que se junta ${elegir.origen.nombre}`}
          </p>
          <button
            type="button"
            onClick={() => setElegir(null)}
            className="inline-flex items-center gap-1 rounded-lg bg-background/15 px-3 py-1.5 text-sm"
          >
            <X className="h-4 w-4" /> Cancelar
          </button>
        </div>
      )}

      {vista === 'plano' ? (
        <>
          {zonas.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {zonas.map((z) => {
                const ocupadas = mesas.filter((m) => m.zona_id === z.id && cuentaDe.has(m.id)).length;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZonaId(z.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${
                      z.id === zona.id ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {z.nombre}
                    {ocupadas > 0 && (
                      <span className="rounded-full bg-[var(--egreso)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
                        {ocupadas}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Plano
            zona={zona}
            piezas={piezas}
            infoMesa={infoMesa}
            onTocarMesa={tocarMesa}
            elegibles={elegibles}
          />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {listaMesas.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No hay mesas {ESTADOS[filtro as EstadoMesa]?.nombre.toLowerCase() ?? ''} ahora.
            </p>
          )}
          {listaMesas.map((m) => {
            const info = infoMesa(m.id);
            const bloqueada = Boolean(elegibles && !elegibles.has(m.id));
            return (
              <button
                key={m.id}
                type="button"
                disabled={bloqueada}
                onClick={() => tocarMesa(m)}
                className="flex flex-col items-start gap-1 rounded-2xl border-l-4 bg-card p-3.5 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-30"
                style={{ borderLeftColor: ESTADOS[info.estado].color }}
              >
                <span className="w-full truncate font-semibold">{m.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {ESTADOS[info.estado].nombre}
                  {zonas.length > 1 ? ` · ${zonaNombre.get(m.zona_id)}` : ''}
                </span>
                {info.total != null && (
                  <span className="text-lg font-bold tabular-nums">{formatCOP(info.total)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Cuentas que no están en una mesa del plano */}
      {otras.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Otras cuentas abiertas</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {otras.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={Boolean(elegir)}
                onClick={() => {
                  cargarCuenta({
                    id: c.id,
                    mesa: c.mesa,
                    mesaId: null,
                    cliente: c.cliente,
                    items: lineasParaCarrito(c),
                    huella: huellaCuenta(c.items),
                  });
                  ir('/dashboard/pos');
                }}
                className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-sm disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.mesa}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.items.reduce((a, i) => a + i.cantidad, 0)} productos
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatCOP(c.total)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <PanelMesa
        pieza={piezaAbierta}
        zona={piezaAbierta && zonas.length > 1 ? zonaNombre.get(piezaAbierta.zona_id) ?? '' : ''}
        estado={piezaAbierta ? estadoDe(piezaAbierta) : 'libre'}
        cuenta={piezaAbierta ? cuentaDe.get(piezaAbierta.id) ?? null : null}
        ahora={ahora}
        ocupado={ocupado}
        acciones={piezaAbierta ? accionesDe(piezaAbierta) : vacias}
        onCerrar={() => setAbierta(null)}
      />
    </div>
  );
}

/** Primera vez: "¿cuántas mesas tienes?" y se dibujan solas. */
function CrearSalon({ onCrear, onVacio }: { onCrear: (n: number) => void; onVacio: () => void }) {
  const [n, setN] = useState('10');
  const num = Number(n);
  const valido = Number.isInteger(num) && num >= 1 && num <= 60;

  return (
    <div className="rounded-3xl bg-card p-6 shadow-sm">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary">
          <LayoutGrid className="h-7 w-7 text-muted-foreground" />
        </span>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold">Dibuja tu salón</p>
          <p className="text-sm text-muted-foreground">
            Verás cada mesa con su color: libre, ocupada, por cobrar o reservada. Dinos cuántas tienes
            y te las acomodamos; después las arrastras a su sitio.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={n}
            onChange={(e) => setN(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valido && onCrear(num)}
            className="h-12 w-24 rounded-2xl text-center text-lg font-semibold"
            aria-label="Cuántas mesas"
          />
          <Button className="h-12 rounded-2xl px-5" disabled={!valido} onClick={() => onCrear(num)}>
            Crear {valido ? num : ''} mesas
          </Button>
        </div>
        <button
          type="button"
          onClick={onVacio}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Prefiero dibujarlo desde cero
        </button>
      </div>
    </div>
  );
}

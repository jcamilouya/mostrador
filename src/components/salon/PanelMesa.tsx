'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  ChefHat,
  Combine,
  Loader2,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ESTADOS, type EstadoMesa, type PiezaConReserva, type Reserva } from '@/lib/salon/modelo';
import type { CuentaAbierta } from '@/lib/mesas/queries';
import { formatCOP } from '@/lib/utils/format';

export type AccionesMesa = {
  tomarPedido: () => void;
  agregar: () => void;
  cobrar: () => void;
  pedirCuenta: (pedir: boolean) => void;
  mover: () => void;
  juntar: () => void;
  anular: () => void;
  reservar: (r: { nombre: string; en: string; personas: number | null }) => void;
  quitarReserva: () => void;
  marchar: () => void;
  imprimirCuenta: () => void;
};

/** Lo que puede hacer quien está usando la app (023). */
export type PermisosMesa = { cobrar: boolean; anular: boolean };

/**
 * Junta las líneas iguales para leerlas: al juntar dos mesas quedaban
 * "1× Cerveza" y "1× Cerveza" en renglones distintos.
 */
function agrupar(items: CuentaAbierta['items']): CuentaAbierta['items'] {
  const m = new Map<string, CuentaAbierta['items'][number]>();
  for (const i of items) {
    // La nota y si ya está en cocina separan renglones: cocina los ve distinto.
    const k = `${i.nombre_producto}|${i.precio_unitario}|${i.nota ?? ''}|${i.marchado}`;
    const ya = m.get(k);
    m.set(k, ya ? { ...ya, cantidad: ya.cantidad + i.cantidad } : i);
  }
  return [...m.values()];
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function haceCuanto(desde: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60000));
  if (min < 1) return 'recién abierta';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`;
}

/** Día de la reserva en palabras: "hoy", "mañana" o la fecha. */
function diaReserva(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const man = new Date();
  man.setDate(hoy.getDate() + 1);
  if (d.toDateString() === hoy.toDateString()) return 'hoy';
  if (d.toDateString() === man.toDateString()) return 'mañana';
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Lo que sale al tocar una mesa. Lo importante grande (estado y total), la
 * comanda en lista, y las acciones según el estado: libre → tomar pedido o
 * reservar; ocupada → agregar, cobrar, pedir la cuenta, cambiar, juntar.
 */
export function PanelMesa({
  pieza,
  zona,
  estado,
  cuenta,
  ahora,
  ocupado,
  acciones,
  permisos,
  onCerrar,
}: {
  pieza: PiezaConReserva | null;
  zona: string;
  estado: EstadoMesa;
  cuenta: CuentaAbierta | null;
  ahora: number;
  /** Hay una acción en curso: se deshabilitan los botones. */
  ocupado: boolean;
  acciones: AccionesMesa;
  permisos: PermisosMesa;
  onCerrar: () => void;
}) {
  const [reservando, setReservando] = useState(false);

  const abierto = Boolean(pieza);
  const reserva: Reserva | null = pieza?.reserva ?? null;
  const unidades = cuenta?.items.reduce((a, i) => a + i.cantidad, 0) ?? 0;
  const pendientes = cuenta?.items.filter((i) => !i.marchado).reduce((a, i) => a + i.cantidad, 0) ?? 0;

  function cobrar() {
    if (pendientes > 0 && !confirm(`Hay ${pendientes} sin marchar a cocina. ¿Cobrar de todos modos?`)) return;
    acciones.cobrar();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) {
          setReservando(false);
          onCerrar();
        }
      }}
    >
      <DialogContent className="max-w-md rounded-3xl p-5">
        {pieza && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: ESTADOS[estado].color }}
                  aria-hidden
                />
                {pieza.nombre}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {ESTADOS[estado].nombre}
                {zona ? ` · ${zona}` : ''}
                {pieza.puestos ? ` · ${pieza.puestos} puestos` : ''}
              </p>
            </DialogHeader>

            {reservando ? (
              <FormReserva
                ocupado={ocupado}
                onCancelar={() => setReservando(false)}
                onGuardar={(r) => {
                  acciones.reservar(r);
                  setReservando(false);
                }}
              />
            ) : cuenta ? (
              <div className="space-y-4">
                {/* Total y tiempo */}
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-bold tabular-nums">{formatCOP(cuenta.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {unidades} {unidades === 1 ? 'producto' : 'productos'} · {haceCuanto(cuenta.abiertaDesde, ahora)}
                    </p>
                  </div>
                  {cuenta.pedidaEn && (
                    <span className="rounded-full bg-[var(--utilidad)]/20 px-2.5 py-1 text-xs font-medium">
                      Pidió la cuenta {hora(cuenta.pedidaEn)}
                    </span>
                  )}
                </div>

                {/* Lo que falta mandar a cocina */}
                {pendientes > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl bg-[var(--utilidad)]/15 px-3 py-2.5">
                    <ChefHat className="h-4 w-4 shrink-0" />
                    <p className="flex-1 text-sm font-medium">
                      {pendientes} sin marchar a cocina
                    </p>
                    <Button size="sm" className="rounded-xl" disabled={ocupado} onClick={acciones.marchar}>
                      Marchar
                    </Button>
                  </div>
                )}

                {/* Comanda */}
                <ul className="max-h-[38vh] space-y-1.5 overflow-y-auto rounded-2xl bg-secondary/60 p-3 text-sm">
                  {agrupar(cuenta.items).map((i, idx) => (
                    <li key={idx} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-semibold tabular-nums">{i.cantidad}×</span> {i.nombre_producto}
                        {!i.marchado && (
                          <span className="ml-1.5 rounded bg-[var(--utilidad)]/25 px-1 text-[10px] font-medium">
                            sin marchar
                          </span>
                        )}
                        {i.nota && <span className="block pl-5 text-xs text-[var(--utilidad)]">→ {i.nota}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatCOP(i.cantidad * i.precio_unitario)}
                      </span>
                    </li>
                  ))}
                </ul>
                {cuenta.cliente && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {cuenta.cliente.nombre}
                  </p>
                )}

                {/* Lo principal */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-12 rounded-2xl gap-2" disabled={ocupado} onClick={acciones.agregar}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                  {permisos.cobrar ? (
                    <Button className="h-12 rounded-2xl gap-2" disabled={ocupado} onClick={cobrar}>
                      <Wallet className="h-4 w-4" /> Cobrar
                    </Button>
                  ) : (
                    <Button
                      className="h-12 rounded-2xl gap-2"
                      disabled={ocupado || Boolean(cuenta.pedidaEn)}
                      onClick={() => acciones.pedirCuenta(true)}
                    >
                      <Receipt className="h-4 w-4" /> {cuenta.pedidaEn ? 'Cuenta pedida' : 'Pidieron la cuenta'}
                    </Button>
                  )}
                </div>

                {/* Lo demás, más chico */}
                <div className="flex flex-wrap gap-1.5">
                  <Chico disabled={ocupado} onClick={() => acciones.pedirCuenta(!cuenta.pedidaEn)}>
                    <Receipt className="h-3.5 w-3.5" />
                    {cuenta.pedidaEn ? 'Ya no la pidieron' : 'Pidieron la cuenta'}
                  </Chico>
                  <Chico disabled={ocupado} onClick={acciones.mover}>
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Cambiar de mesa
                  </Chico>
                  <Chico disabled={ocupado} onClick={acciones.juntar}>
                    <Combine className="h-3.5 w-3.5" /> Juntar
                  </Chico>
                  <Chico disabled={ocupado} onClick={acciones.imprimirCuenta}>
                    <Printer className="h-3.5 w-3.5" /> Imprimir cuenta
                  </Chico>
                  {permisos.anular && (
                    <Chico disabled={ocupado} onClick={acciones.anular} peligro>
                      <Trash2 className="h-3.5 w-3.5" /> Anular
                    </Chico>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {reserva && (
                  <div className="rounded-2xl bg-[var(--reservada)]/12 p-3 text-sm">
                    <p className="font-semibold">{reserva.nombre}</p>
                    <p className="text-muted-foreground">
                      {diaReserva(reserva.en)} a las {hora(reserva.en)}
                      {reserva.personas ? ` · ${reserva.personas} personas` : ''}
                    </p>
                  </div>
                )}
                <Button
                  size="lg"
                  className="h-14 w-full rounded-2xl text-base font-semibold gap-2"
                  disabled={ocupado}
                  onClick={acciones.tomarPedido}
                >
                  {ocupado ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  {reserva ? 'Llegaron: tomar pedido' : 'Tomar pedido'}
                </Button>
                {reserva ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-2xl"
                    disabled={ocupado}
                    onClick={acciones.quitarReserva}
                  >
                    Quitar la reserva
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-2xl gap-2"
                    disabled={ocupado}
                    onClick={() => setReservando(true)}
                  >
                    <CalendarClock className="h-4 w-4" /> Reservar
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chico({
  children,
  onClick,
  disabled,
  peligro = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
        peligro ? 'text-muted-foreground hover:text-[var(--egreso)]' : 'text-foreground hover:bg-secondary/70'
      }`}
    >
      {children}
    </button>
  );
}

/** Próxima media hora en punto, como "19:30" para el input de hora. */
function proximaMediaHora(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function FormReserva({
  ocupado,
  onCancelar,
  onGuardar,
}: {
  ocupado: boolean;
  onCancelar: () => void;
  onGuardar: (r: { nombre: string; en: string; personas: number | null }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [dia, setDia] = useState<'hoy' | 'manana'>('hoy');
  const [horaTxt, setHoraTxt] = useState(proximaMediaHora);
  const [personas, setPersonas] = useState('');
  const [error, setError] = useState('');

  function guardar() {
    const [h, m] = horaTxt.split(':').map(Number);
    if (!nombre.trim()) return setError('¿A nombre de quién?');
    if (!Number.isFinite(h) || !Number.isFinite(m)) return setError('Elige la hora');
    const d = new Date();
    if (dia === 'manana') d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now() - 60 * 60 * 1000) return setError('Esa hora ya pasó. ¿Era para mañana?');
    const p = Number(personas);
    onGuardar({
      nombre: nombre.trim(),
      en: d.toISOString(),
      personas: personas && Number.isInteger(p) && p > 0 && p < 100 ? p : null,
    });
  }

  return (
    <div className="space-y-3">
      <Input
        autoFocus
        value={nombre}
        maxLength={60}
        onChange={(e) => {
          setNombre(e.target.value);
          setError('');
        }}
        placeholder="A nombre de…"
        className="h-12 rounded-2xl"
      />
      <div className="flex gap-2">
        {(['hoy', 'manana'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDia(d)}
            className={`h-11 flex-1 rounded-2xl text-sm font-medium ${
              dia === d ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {d === 'hoy' ? 'Hoy' : 'Mañana'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="time"
          value={horaTxt}
          onChange={(e) => {
            setHoraTxt(e.target.value);
            setError('');
          }}
          className="h-12 flex-1 rounded-2xl"
          aria-label="Hora"
        />
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={personas}
          onChange={(e) => setPersonas(e.target.value)}
          placeholder="Personas"
          className="h-12 w-32 rounded-2xl"
        />
      </div>
      {error && <p className="text-sm text-[var(--egreso)]">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12 rounded-2xl" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </Button>
        <Button className="h-12 rounded-2xl" onClick={guardar} disabled={ocupado}>
          Guardar reserva
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, ArrowLeft, Camera, Sparkles, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { CATEGORIA_INFO, CATEGORIAS_EGRESO, type CategoriaEgreso } from '@/lib/egresos/schemas';
import type { Egreso } from '@/lib/egresos/queries';
import type { ActionState } from '@/lib/egresos/actions';
import { IngredientesDetectados, type LineaDetectada } from '@/components/insumos/IngredientesDetectados';

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'breb', label: 'Bre-B' },
];

const CONFIANZA_LABEL: Record<string, string> = {
  alta: 'Alta confianza',
  media: 'Confianza media',
  baja: 'Baja confianza — revisa los datos',
};

type DatosIA = {
  proveedor: string | null;
  monto: number | null;
  fecha: string | null;
  categoria: CategoriaEgreso | null;
  descripcion: string | null;
  confianza: 'alta' | 'media' | 'baja';
  ingredientes?: LineaDetectada[];
};

function SubmitButton({ creando }: { creando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="rounded-2xl gap-2 h-12 flex-1" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Guardando…
        </>
      ) : (
        <>
          <Save className="h-4 w-4" />
          {creando ? 'Guardar gasto' : 'Guardar cambios'}
        </>
      )}
    </Button>
  );
}

export function ExpenseForm({
  action,
  egreso,
  insumos = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  egreso?: Egreso;
  insumos?: { id: string; nombre: string; unidad: string }[];
}) {
  const [state, formAction] = useActionState(action, {});

  const today = new Date().toISOString().slice(0, 10);

  // Campos controlados para que la IA pueda llenarlos
  const [categoria, setCategoria] = useState<CategoriaEgreso>(
    (egreso?.categoria as CategoriaEgreso) ?? 'proveedores',
  );
  const [monto, setMonto] = useState(egreso?.monto?.toString() ?? '');
  const [proveedor, setProveedor] = useState(egreso?.proveedor ?? '');
  const [fecha, setFecha] = useState(egreso?.fecha ?? today);
  const [descripcion, setDescripcion] = useState(egreso?.descripcion ?? '');

  // Estado del escáner IA
  const [scanEstado, setScanEstado] = useState<'idle' | 'scanning' | 'ok' | 'error'>('idle');
  const [scanResultado, setScanResultado] = useState<DatosIA | null>(null);
  const [scanError, setScanError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function aplicarDatosIA(datos: DatosIA) {
    if (datos.monto != null) setMonto(String(datos.monto));
    if (datos.proveedor) setProveedor(datos.proveedor);
    if (datos.fecha) setFecha(datos.fecha);
    if (datos.descripcion) setDescripcion(datos.descripcion);
    if (datos.categoria && CATEGORIAS_EGRESO.includes(datos.categoria)) {
      setCategoria(datos.categoria);
    }
  }

  async function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setScanEstado('scanning');
    setScanResultado(null);
    setScanError('');

    const fd = new FormData();
    fd.append('imagen', archivo);

    try {
      const res = await fetch('/api/ia/leer-factura', { method: 'POST', body: fd });
      const json = await res.json() as { ok: boolean; datos?: DatosIA; error?: string };

      if (!json.ok || !json.datos) {
        setScanError(json.error ?? 'No se pudo leer la imagen');
        setScanEstado('error');
        return;
      }

      setScanResultado(json.datos);
      setScanEstado('ok');
      aplicarDatosIA(json.datos);
    } catch {
      setScanError('Error de conexión. Intenta de nuevo.');
      setScanEstado('error');
    } finally {
      // Limpiar input para permitir subir la misma foto de nuevo
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function resetScaner() {
    setScanEstado('idle');
    setScanResultado(null);
    setScanError('');
  }

  return (
    <div className="space-y-5">
      {/* Escáner IA */}
      {!egreso && (
        <div className="rounded-3xl bg-card shadow-sm overflow-hidden">
          {/* Botón principal */}
          {scanEstado === 'idle' && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-4 p-5 text-left hover:bg-secondary/50 transition-colors"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--utilidad)]/15">
                <Sparkles className="h-6 w-6 text-[var(--utilidad)]" />
              </span>
              <div className="flex-1">
                <p className="font-semibold">Leer factura con IA</p>
                <p className="text-xs text-muted-foreground">
                  Toma una foto y Claude llena los campos por ti
                </p>
              </div>
              <Camera className="h-5 w-5 text-muted-foreground" />
            </button>
          )}

          {/* Escaneando */}
          {scanEstado === 'scanning' && (
            <div className="flex items-center gap-4 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--utilidad)]/15">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--utilidad)]" />
              </span>
              <div>
                <p className="font-semibold">Analizando factura…</p>
                <p className="text-xs text-muted-foreground">Claude está leyendo la imagen</p>
              </div>
            </div>
          )}

          {/* Resultado OK */}
          {scanEstado === 'ok' && scanResultado && (
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[var(--ingreso)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Factura detectada</p>
                  <p className="text-xs text-muted-foreground">
                    {CONFIANZA_LABEL[scanResultado.confianza]} — los campos se llenaron automáticamente
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetScaner}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Subir otra foto
              </button>
            </div>
          )}

          {/* Error */}
          {scanEstado === 'error' && (
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-[var(--egreso)] mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">No se pudo leer</p>
                  <p className="text-xs text-muted-foreground">{scanError}</p>
                </div>
                <button
                  type="button"
                  onClick={resetScaner}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Intentar con otra foto
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleArchivoSeleccionado}
          />
        </div>
      )}

      {/* Ingredientes detectados en la factura → sumar al inventario */}
      {!egreso &&
        scanEstado === 'ok' &&
        scanResultado?.ingredientes &&
        scanResultado.ingredientes.length > 0 && (
          <IngredientesDetectados lineas={scanResultado.ingredientes} insumos={insumos} />
        )}

      <form action={formAction} className="space-y-5">
        {/* Selector visual de categoría */}
        <div className="space-y-2">
          <Label>Categoría</Label>
          <input type="hidden" name="categoria" value={categoria} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIAS_EGRESO.map((c) => {
              const info = CATEGORIA_INFO[c];
              const active = categoria === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-3 text-xs font-medium transition-all ${
                    active
                      ? 'border-foreground bg-secondary'
                      : 'border-transparent bg-card hover:bg-secondary/50'
                  }`}
                >
                  <span className="text-2xl">{info.emoji}</span>
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monto">¿Cuánto pagaste? *</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground">$</span>
              <Input
                id="monto"
                name="monto"
                type="number"
                step="100"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                required
                className="rounded-xl h-14 pl-10 text-2xl font-semibold tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor / a quién</Label>
              <Input
                id="proveedor"
                name="proveedor"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Distribuidora Postobón"
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha *</Label>
              <Input
                id="fecha"
                name="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="rounded-xl h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="metodo_pago">¿Cómo pagaste?</Label>
            <Select name="metodo_pago" defaultValue={egreso?.metodo_pago ?? 'efectivo'}>
              <SelectTrigger className="rounded-xl h-11" id="metodo_pago">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODOS_PAGO.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Nota (opcional)</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Compra semanal de gaseosas para el restaurante"
              className="rounded-xl min-h-20"
            />
          </div>
        </div>

        {state.error && (
          <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
            {state.error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link href="/dashboard/egresos" className="sm:flex-none">
            <Button type="button" variant="outline" className="w-full rounded-2xl gap-2 h-12">
              <ArrowLeft className="h-4 w-4" />
              Cancelar
            </Button>
          </Link>
          <SubmitButton creando={!egreso} />
        </div>
      </form>
    </div>
  );
}

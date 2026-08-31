'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2, Check, Sparkles, RotateCcw } from 'lucide-react';
import { crearProductosDesdeCarta } from '@/lib/inventario/actions';
import { formatCOP } from '@/lib/utils/format';

type Linea = {
  nombre: string;
  precio: string;
  categoria: string | null;
  descripcion: string | null;
};

/** Comprime la foto en el navegador: una foto de celular no cabe en el límite. */
async function comprimir(file: File, maxDim = 1600, calidad = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    if (!blob) return file;
    return new File([blob], 'carta.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Carga la lista de productos a partir de una foto de la carta.
 *
 * El muro del primer día no es entender la app: es teclear cuarenta productos.
 * Aquí el dueño toma una foto, revisa lo que salió, corrige lo que quedó mal y
 * confirma. Siempre revisa antes de guardar: la IA se puede equivocar en un
 * precio y eso es plata.
 */
export function CartaPorFoto({
  onListo,
  compacto = false,
}: {
  /** Se llama cuando los productos ya quedaron creados. */
  onListo?: (creados: number) => void;
  /** Versión sin encabezado, para incrustar en el registro. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [guardando, startGuardar] = useTransition();

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLeyendo(true);
    try {
      const fd = new FormData();
      fd.append('imagen', await comprimir(file));
      const res = await fetch('/api/ia/leer-carta', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? 'No pudimos leer la foto.');
      } else {
        setLineas(
          (json.productos as { nombre: string; precio: number; categoria: string | null; descripcion: string | null }[]).map(
            (p) => ({
              nombre: p.nombre,
              precio: String(p.precio || ''),
              categoria: p.categoria,
              descripcion: p.descripcion,
            }),
          ),
        );
      }
    } catch {
      setError('Se cayó la conexión mientras leíamos la foto. Intenta de nuevo.');
    } finally {
      setLeyendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function cambiar(idx: number, campo: 'nombre' | 'precio', valor: string) {
    setLineas((prev) =>
      prev ? prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)) : prev,
    );
  }
  function quitar(idx: number) {
    setLineas((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  const validas = (lineas ?? []).filter(
    (l) => l.nombre.trim().length > 1 && Number(l.precio) > 0,
  );
  const sinPrecio = (lineas ?? []).filter((l) => !(Number(l.precio) > 0)).length;
  const total = validas.reduce((a, l) => a + Number(l.precio), 0);

  function guardar() {
    if (validas.length === 0) {
      toast('Ponle precio a por lo menos un producto');
      return;
    }
    startGuardar(async () => {
      const res = await crearProductosDesdeCarta(
        validas.map((l) => ({
          nombre: l.nombre.trim(),
          precio: Number(l.precio),
          categoria: l.categoria,
          descripcion: l.descripcion,
        })),
      );
      if (res.ok) {
        toast.success(`${res.creados} productos cargados 🎉`, {
          description: res.omitidos ? `${res.omitidos} se saltaron porque ya existían.` : undefined,
        });
        setLineas(null);
        router.refresh();
        onListo?.(res.creados ?? 0);
      } else {
        toast('No se pudo guardar', { description: res.error });
      }
    });
  }

  // ── Paso 1: tomar la foto ──
  if (!lineas) {
    return (
      <div
        className={
          compacto
            ? 'space-y-3'
            : 'flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-10 text-center shadow-sm'
        }
      >
        {!compacto && (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
              📸
            </span>
            <div className="space-y-1.5">
              <p className="text-lg font-semibold">Carga tu carta con una foto</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Tómale una foto al menú y sacamos los platos con sus precios. Los revisas,
                corriges lo que haga falta y quedan cargados.
              </p>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onFoto}
        />
        <Button
          size="lg"
          disabled={leyendo}
          onClick={() => inputRef.current?.click()}
          className="h-14 w-full max-w-xs rounded-2xl gap-2 text-base"
        >
          {leyendo ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Leyendo tu carta…
            </>
          ) : (
            <>
              <Camera className="h-5 w-5" /> Tomar foto de la carta
            </>
          )}
        </Button>

        {leyendo && (
          <p className="text-xs text-muted-foreground">
            Esto se demora unos segundos. No cierres la pantalla.
          </p>
        )}
        {error && (
          <p className="max-w-sm rounded-2xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Paso 2: revisar y corregir ──
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--ingreso)]/10 p-4">
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-[var(--ingreso)]" />
          <span>
            Encontramos <strong>{lineas.length}</strong> productos.{' '}
            <span className="text-muted-foreground">Revísalos antes de guardar.</span>
          </span>
        </p>
        <Button
          variant="outline"
          className="rounded-2xl gap-2"
          onClick={() => {
            setLineas(null);
            setError(null);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Otra foto
        </Button>
      </div>

      {sinPrecio > 0 && (
        <p className="rounded-2xl bg-[var(--utilidad)]/15 px-4 py-3 text-sm">
          {sinPrecio === 1
            ? 'Hay 1 producto sin precio: ponle el precio o quítalo.'
            : `Hay ${sinPrecio} productos sin precio: ponles precio o quítalos.`}{' '}
          <span className="text-muted-foreground">Sin precio no se guardan.</span>
        </p>
      )}

      <ul className="space-y-2">
        {lineas.map((l, idx) => {
          const falta = !(Number(l.precio) > 0);
          return (
            <li
              key={idx}
              className={`rounded-2xl border p-2.5 ${
                falta ? 'border-[var(--utilidad)]' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={l.nombre}
                  onChange={(e) => cambiar(idx, 'nombre', e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl"
                />
                <div className="relative w-28 shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    value={l.precio}
                    onChange={(e) => cambiar(idx, 'precio', e.target.value)}
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    className="h-11 rounded-xl pl-6 tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => quitar(idx)}
                  className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-[var(--egreso)]"
                  aria-label={`Quitar ${l.nombre}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {l.categoria && (
                <p className="mt-1.5 pl-1 text-xs text-muted-foreground">{l.categoria}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-4 space-y-2 rounded-2xl bg-card p-3 shadow-lg">
        <p className="text-center text-xs text-muted-foreground">
          Se van a cargar <strong>{validas.length}</strong> productos
          {total > 0 && ` · la carta suma ${formatCOP(total)}`}
        </p>
        <Button
          size="lg"
          onClick={guardar}
          disabled={guardando || validas.length === 0}
          className="h-13 w-full rounded-2xl gap-2 py-3 text-base font-semibold"
        >
          {guardando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          Guardar {validas.length} productos
        </Button>
      </div>
    </div>
  );
}

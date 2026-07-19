'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PackagePlus, Check, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UNIDADES, unidadesCompatibles, getUnidad } from '@/lib/insumos/units';
import { procesarCompraIngredientes } from '@/lib/insumos/actions';

export type LineaDetectada = {
  nombre: string;
  cantidad: number | null;
  unidad: string | null;
  costo_total: number | null;
};

type InsumoOpcion = { id: string; nombre: string; unidad: string };

type Fila = {
  nombre: string;
  cantidad: string;
  unidad: string;
  costo: string;
  insumo_id: string; // '' = crear nuevo
  incluir: boolean;
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function mismaDimension(a: string, b: string): boolean {
  return getUnidad(a)?.dim === getUnidad(b)?.dim;
}

export function IngredientesDetectados({
  lineas,
  insumos,
}: {
  lineas: LineaDetectada[];
  insumos: InsumoOpcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [listo, setListo] = useState(false);

  const [filas, setFilas] = useState<Fila[]>(() =>
    lineas.map((l) => {
      const match = insumos.find((i) => {
        const a = norm(i.nombre);
        const b = norm(l.nombre);
        return a === b || a.includes(b) || b.includes(a);
      });
      const unidadLinea = l.unidad && getUnidad(l.unidad) ? l.unidad : 'unidad';
      const unidad = match
        ? mismaDimension(unidadLinea, match.unidad)
          ? unidadLinea
          : match.unidad
        : unidadLinea;
      return {
        nombre: l.nombre ?? '',
        cantidad: l.cantidad != null ? String(l.cantidad) : '',
        unidad,
        costo: l.costo_total != null ? String(l.costo_total) : '',
        insumo_id: match?.id ?? '',
        incluir: true,
      };
    }),
  );

  function set(idx: number, campo: keyof Fila, valor: string | boolean) {
    setFilas((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        const next = { ...f, [campo]: valor } as Fila;
        // Al vincular a un insumo, si la unidad no es compatible, ajústala.
        if (campo === 'insumo_id' && valor) {
          const ins = insumos.find((x) => x.id === valor);
          if (ins && !mismaDimension(next.unidad, ins.unidad)) next.unidad = ins.unidad;
        }
        return next;
      }),
    );
  }

  function unidadesDeFila(f: Fila) {
    if (f.insumo_id) {
      const ins = insumos.find((x) => x.id === f.insumo_id);
      if (ins) return unidadesCompatibles(ins.unidad);
    }
    return UNIDADES;
  }

  const incluidas = filas.filter((f) => f.incluir && f.nombre.trim() && Number(f.cantidad) > 0);

  function agregar() {
    startTransition(async () => {
      const res = await procesarCompraIngredientes(
        incluidas.map((f) => ({
          nombre: f.nombre.trim(),
          cantidad: Number(f.cantidad),
          unidad: f.unidad,
          costo_total: f.costo ? Number(f.costo) : null,
          insumo_id: f.insumo_id || null,
        })),
      );
      if (res.ok) {
        setListo(true);
        toast.success(`${res.agregados ?? 0} ingrediente(s) agregados al inventario`);
        router.refresh();
      } else {
        toast('No se pudieron agregar', { description: res.error });
      }
    });
  }

  if (lineas.length === 0) return null;

  if (listo) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-[var(--ingreso)]/10 p-5 text-sm">
        <Check className="h-5 w-5 text-[var(--ingreso)]" />
        <p className="font-medium">Ingredientes agregados a tu inventario. 🥕</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--utilidad)]/15">
          <PackagePlus className="h-5 w-5 text-[var(--utilidad)]" />
        </span>
        <div>
          <p className="font-semibold">Ingredientes de esta compra</p>
          <p className="text-xs text-muted-foreground">
            Revisa, vincula a un ingrediente que ya tengas (o déjalo como nuevo) y súmalos al
            inventario.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {filas.map((f, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border p-3 space-y-2 ${
              f.incluir ? 'border-border' : 'border-transparent opacity-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.incluir}
                onChange={(e) => set(idx, 'incluir', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Input
                value={f.nombre}
                onChange={(e) => set(idx, 'nombre', e.target.value)}
                placeholder="Nombre del ingrediente"
                className="h-10 rounded-xl flex-1"
              />
            </div>

            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
              <Input
                value={f.cantidad}
                onChange={(e) => set(idx, 'cantidad', e.target.value)}
                type="number"
                step="any"
                min="0"
                placeholder="Cant."
                className="h-10 rounded-xl tabular-nums"
              />
              <select
                value={f.unidad}
                onChange={(e) => set(idx, 'unidad', e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-2 text-sm"
              >
                {unidadesDeFila(f).map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.corto}
                  </option>
                ))}
              </select>
              <Input
                value={f.costo}
                onChange={(e) => set(idx, 'costo', e.target.value)}
                type="number"
                step="any"
                min="0"
                placeholder="$ total"
                className="h-10 rounded-xl tabular-nums"
              />
            </div>

            <select
              value={f.insumo_id}
              onChange={(e) => set(idx, 'insumo_id', e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm"
            >
              <option value="">➕ Crear ingrediente nuevo</option>
              {insumos.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  Sumar a: {ins.nombre}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <Button
        type="button"
        onClick={agregar}
        disabled={pending || incluidas.length === 0}
        className="w-full rounded-2xl h-11 gap-2"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="h-4 w-4" />
        )}
        Agregar {incluidas.length > 0 ? `${incluidas.length} ` : ''}al inventario
      </Button>
    </div>
  );
}

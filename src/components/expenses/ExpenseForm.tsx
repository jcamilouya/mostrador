'use client';

import { useActionState, useState } from 'react';
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
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { CATEGORIA_INFO, CATEGORIAS_EGRESO, type CategoriaEgreso } from '@/lib/egresos/schemas';
import type { Egreso } from '@/lib/egresos/queries';
import type { ActionState } from '@/lib/egresos/actions';

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'breb', label: 'Bre-B' },
];

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
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  egreso?: Egreso;
}) {
  const [state, formAction] = useActionState(action, {});
  const [categoria, setCategoria] = useState<CategoriaEgreso>(
    (egreso?.categoria as CategoriaEgreso) ?? 'proveedores',
  );

  const fechaDefault = egreso?.fecha ?? new Date().toISOString().slice(0, 10);

  return (
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
              defaultValue={egreso?.monto ?? ''}
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
              defaultValue={egreso?.proveedor ?? ''}
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
              defaultValue={fechaDefault}
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
            defaultValue={egreso?.descripcion ?? ''}
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
  );
}

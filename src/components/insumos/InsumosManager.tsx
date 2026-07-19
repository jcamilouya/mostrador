'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, PackagePlus, SlidersHorizontal, Trash2, AlertTriangle, Carrot } from 'lucide-react';
import {
  crearInsumo,
  actualizarInsumo,
  agregarStock,
  ajustarStock,
  archivarInsumo,
  type InsumoState,
} from '@/lib/insumos/actions';
import { UNIDADES, unidadesCompatibles, unidadCorta, formatCantidad } from '@/lib/insumos/units';
import type { InsumoConAlerta } from '@/lib/insumos/queries';
import { formatCOP } from '@/lib/utils/format';

type Modal =
  | { tipo: 'crear' }
  | { tipo: 'editar'; insumo: InsumoConAlerta }
  | { tipo: 'agregar'; insumo: InsumoConAlerta }
  | { tipo: 'ajustar'; insumo: InsumoConAlerta }
  | null;

export function InsumosManager({ insumos }: { insumos: InsumoConAlerta[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const cerrar = () => {
    setModal(null);
    router.refresh();
  };

  const bajos = insumos.filter((i) => i.bajo).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {bajos > 0 && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--egreso)]">
              <AlertTriangle className="h-4 w-4" /> {bajos} ingrediente{bajos === 1 ? '' : 's'} por
              agotarse
            </p>
          )}
        </div>
        <Button className="rounded-2xl gap-2" onClick={() => setModal({ tipo: 'crear' })}>
          <Plus className="h-4 w-4" /> Nuevo ingrediente
        </Button>
      </div>

      {insumos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-10 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Carrot className="h-7 w-7 text-muted-foreground" />
          </span>
          <p className="text-sm text-muted-foreground">
            Aún no tienes ingredientes. Agrégalos para controlar cuánto pan, carne, tomate… te
            queda, y descontarlos solos al vender.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {insumos.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    Mínimo {formatCantidad(i.stock_minimo, i.unidad)}
                    {i.costo_unitario > 0 &&
                      ` · ${formatCOP(i.costo_unitario)}/${unidadCorta(i.unidad)}`}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={`font-semibold tabular-nums ${
                      i.bajo ? 'text-[var(--egreso)]' : ''
                    }`}
                  >
                    {formatCantidad(i.stock_actual, i.unidad)}
                  </p>
                  {i.bajo && <p className="text-[10px] font-medium text-[var(--egreso)]">Bajo</p>}
                </div>

                <div className="flex items-center gap-1">
                  <IconBtn title="Agregar stock" onClick={() => setModal({ tipo: 'agregar', insumo: i })}>
                    <PackagePlus className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn title="Ajustar" onClick={() => setModal({ tipo: 'ajustar', insumo: i })}>
                    <SlidersHorizontal className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn title="Editar" onClick={() => setModal({ tipo: 'editar', insumo: i })}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    title="Archivar"
                    onClick={async () => {
                      if (confirm(`¿Archivar "${i.nombre}"?`)) {
                        await archivarInsumo(i.id);
                        router.refresh();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--egreso)]" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          {modal?.tipo === 'crear' && (
            <>
              <DialogHeader>
                <DialogTitle>Nuevo ingrediente</DialogTitle>
              </DialogHeader>
              <InsumoForm onDone={cerrar} />
            </>
          )}
          {modal?.tipo === 'editar' && (
            <>
              <DialogHeader>
                <DialogTitle>Editar {modal.insumo.nombre}</DialogTitle>
              </DialogHeader>
              <InsumoForm insumo={modal.insumo} onDone={cerrar} />
            </>
          )}
          {modal?.tipo === 'agregar' && (
            <>
              <DialogHeader>
                <DialogTitle>Agregar stock — {modal.insumo.nombre}</DialogTitle>
              </DialogHeader>
              <AgregarStockForm insumo={modal.insumo} onDone={cerrar} />
            </>
          )}
          {modal?.tipo === 'ajustar' && (
            <>
              <DialogHeader>
                <DialogTitle>Ajustar stock — {modal.insumo.nombre}</DialogTitle>
              </DialogHeader>
              <AjustarForm insumo={modal.insumo} onDone={cerrar} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary"
    >
      {children}
    </button>
  );
}

function Feedback({ state }: { state: InsumoState }) {
  if (state.error)
    return <p className="text-sm text-[var(--egreso)]">{state.error}</p>;
  return null;
}

function InsumoForm({ insumo, onDone }: { insumo?: InsumoConAlerta; onDone: () => void }) {
  const action = insumo ? actualizarInsumo.bind(null, insumo.id) : crearInsumo;
  const [state, formAction, pending] = useActionState<InsumoState, FormData>(action, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" defaultValue={insumo?.nombre} required placeholder="Ej: Tomate, Carne, Pan" className="rounded-xl h-11" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="unidad">Se mide en</Label>
          <select
            id="unidad"
            name="unidad"
            defaultValue={insumo?.unidad ?? 'unidad'}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            {UNIDADES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        {!insumo && (
          <div className="space-y-2">
            <Label htmlFor="stock_actual">Stock inicial</Label>
            <Input id="stock_actual" name="stock_actual" type="number" step="any" min="0" defaultValue="0" className="rounded-xl h-11" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="stock_minimo">Avisar cuando baje de</Label>
          <Input id="stock_minimo" name="stock_minimo" type="number" step="any" min="0" defaultValue={insumo?.stock_minimo ?? 0} className="rounded-xl h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="costo_unitario">Costo por unidad (opcional)</Label>
          <Input id="costo_unitario" name="costo_unitario" type="number" step="any" min="0" defaultValue={insumo?.costo_unitario ?? 0} className="rounded-xl h-11" />
        </div>
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="w-full rounded-2xl h-11">
        {pending ? 'Guardando…' : insumo ? 'Guardar cambios' : 'Crear ingrediente'}
      </Button>
    </form>
  );
}

function AgregarStockForm({ insumo, onDone }: { insumo: InsumoConAlerta; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<InsumoState, FormData>(agregarStock, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  const unidades = unidadesCompatibles(insumo.unidad);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="insumo_id" value={insumo.id} />
      <p className="text-sm text-muted-foreground">
        Tienes {formatCantidad(insumo.stock_actual, insumo.unidad)}. ¿Cuánto compraste?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input id="cantidad" name="cantidad" type="number" step="any" min="0" required autoFocus className="rounded-xl h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unidad">Unidad</Label>
          <select
            id="unidad"
            name="unidad"
            defaultValue={insumo.unidad}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            {unidades.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="costo_total">¿Cuánto pagaste en total? (opcional)</Label>
        <Input id="costo_total" name="costo_total" type="number" step="any" min="0" placeholder="Para calcular el costo por unidad" className="rounded-xl h-11" />
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="w-full rounded-2xl h-11">
        {pending ? 'Agregando…' : 'Agregar al inventario'}
      </Button>
    </form>
  );
}

function AjustarForm({ insumo, onDone }: { insumo: InsumoConAlerta; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<InsumoState, FormData>(ajustarStock, {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="insumo_id" value={insumo.id} />
      <p className="text-sm text-muted-foreground">
        Corrige el stock real (mermas, conteo). Actual: {formatCantidad(insumo.stock_actual, insumo.unidad)}.
      </p>
      <div className="space-y-2">
        <Label htmlFor="nuevo_stock">Nuevo stock ({unidadCorta(insumo.unidad)})</Label>
        <Input id="nuevo_stock" name="nuevo_stock" type="number" step="any" min="0" defaultValue={insumo.stock_actual} required autoFocus className="rounded-xl h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo (opcional)</Label>
        <Input id="motivo" name="motivo" placeholder="Ej: se dañó, conteo físico" className="rounded-xl h-11" />
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="w-full rounded-2xl h-11">
        {pending ? 'Ajustando…' : 'Guardar ajuste'}
      </Button>
    </form>
  );
}

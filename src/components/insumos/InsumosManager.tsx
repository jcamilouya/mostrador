'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, PackagePlus, SlidersHorizontal, Trash2, AlertTriangle, CupSoda, Loader2 } from 'lucide-react';
import {
  crearInsumo,
  actualizarInsumo,
  agregarStock,
  ajustarStock,
  archivarInsumo,
  crearProductoDesdeBebida,
  type InsumoState,
} from '@/lib/insumos/actions';
import { UNIDADES, unidadesCompatibles, unidadCorta, formatCantidad } from '@/lib/insumos/units';
import { MODULOS, getModulo } from '@/lib/insumos/modulos';
import type { InsumoConAlerta } from '@/lib/insumos/queries';
import { formatCOP } from '@/lib/utils/format';

type Modal =
  | { tipo: 'crear' }
  | { tipo: 'editar'; insumo: InsumoConAlerta }
  | { tipo: 'agregar'; insumo: InsumoConAlerta }
  | { tipo: 'ajustar'; insumo: InsumoConAlerta }
  | { tipo: 'ofrecerProducto'; insumoId: string; nombre: string }
  | null;

export function InsumosManager({ insumos }: { insumos: InsumoConAlerta[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [modulo, setModulo] = useState<string>('materia_prima');
  const cerrar = () => {
    setModal(null);
    router.refresh();
  };

  const delModulo = useMemo(
    () => insumos.filter((i) => (i.tipo ?? 'materia_prima') === modulo),
    [insumos, modulo],
  );
  const bajos = insumos.filter((i) => i.bajo).length;
  const modDef = getModulo(modulo);

  return (
    <div className="space-y-4">
      {/* Pestañas de módulos */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODULOS.map((m) => {
          const count = insumos.filter((i) => (i.tipo ?? 'materia_prima') === m.value).length;
          const activo = modulo === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setModulo(m.value)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                activo ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-secondary'
              }`}
            >
              <span>{m.emoji}</span>
              {m.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{modDef?.descripcion}</p>
        <Button className="shrink-0 rounded-2xl gap-2" onClick={() => setModal({ tipo: 'crear' })}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>

      {bajos > 0 && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--egreso)]">
          <AlertTriangle className="h-4 w-4" /> {bajos} ítem{bajos === 1 ? '' : 's'} por agotarse en tu
          inventario
        </p>
      )}

      {delModulo.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-10 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <span className="text-2xl">{modDef?.emoji ?? '📦'}</span>
          </span>
          <p className="text-sm text-muted-foreground">
            Aún no tienes nada en <strong>{modDef?.label}</strong>. Agrégalo para llevar el control y,
            si es materia prima, descontarlo solo al vender.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {delModulo.map((i) => (
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
                  <p className={`font-semibold tabular-nums ${i.bajo ? 'text-[var(--egreso)]' : ''}`}>
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
                <DialogTitle>Nuevo en {modDef?.label}</DialogTitle>
              </DialogHeader>
              <InsumoForm
                defaultTipo={modulo}
                onDone={(res) => {
                  router.refresh();
                  if (res?.sugerirProducto && res.insumoId) {
                    setModal({ tipo: 'ofrecerProducto', insumoId: res.insumoId, nombre: res.nombre ?? '' });
                  } else {
                    setModal(null);
                  }
                }}
              />
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
          {modal?.tipo === 'ofrecerProducto' && (
            <>
              <DialogHeader>
                <DialogTitle>¿Vender esta bebida? 🥤</DialogTitle>
              </DialogHeader>
              <OfrecerProductoForm insumoId={modal.insumoId} nombre={modal.nombre} onDone={cerrar} />
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
  if (state.error) return <p className="text-sm text-[var(--egreso)]">{state.error}</p>;
  return null;
}

function InsumoForm({
  insumo,
  defaultTipo = 'materia_prima',
  onDone,
}: {
  insumo?: InsumoConAlerta;
  defaultTipo?: string;
  onDone: (result?: InsumoState) => void;
}) {
  const action = insumo ? actualizarInsumo.bind(null, insumo.id) : crearInsumo;
  const [state, formAction, pending] = useActionState<InsumoState, FormData>(action, {});
  const [unidad, setUnidad] = useState(insumo?.unidad ?? 'unidad');
  useEffect(() => {
    if (state.ok) onDone(state);
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" defaultValue={insumo?.nombre} required placeholder="Ej: Tomate, Coca-Cola, Silla" className="rounded-xl h-11" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tipo">Módulo</Label>
        <select
          id="tipo"
          name="tipo"
          defaultValue={insumo?.tipo ?? defaultTipo}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        >
          {MODULOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.emoji} {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="unidad">Se mide en</Label>
          <select
            id="unidad"
            name="unidad"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
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
          <Label htmlFor="costo_unitario">Costo por {unidadCorta(unidad)} (opcional)</Label>
          <Input id="costo_unitario" name="costo_unitario" type="number" step="any" min="0" defaultValue={insumo?.costo_unitario ?? 0} className="rounded-xl h-11" />
        </div>
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="w-full rounded-2xl h-11">
        {pending ? 'Guardando…' : insumo ? 'Guardar cambios' : 'Agregar al inventario'}
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

function OfrecerProductoForm({
  insumoId,
  nombre,
  onDone,
}: {
  insumoId: string;
  nombre: string;
  onDone: () => void;
}) {
  const [precio, setPrecio] = useState('');
  const [pending, startTransition] = useTransition();

  function crear() {
    const p = Number(precio);
    if (!Number.isFinite(p) || p <= 0) {
      toast('Ingresa el precio de venta');
      return;
    }
    startTransition(async () => {
      const res = await crearProductoDesdeBebida(insumoId, p);
      if (res.ok) {
        toast.success(`"${nombre}" ya se puede vender en el POS 🥤`);
        onDone();
      } else {
        toast('No se pudo crear', { description: res.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-3">
        <CupSoda className="h-5 w-5 shrink-0 text-[var(--utilidad)]" />
        <p className="text-sm text-muted-foreground">
          Detectamos que agregaste una nueva bebida al inventario.{' '}
          <strong className="text-foreground">¿Deseas crear este producto para venderlo?</strong>{' '}
          Se creará en la categoría <strong>Bebidas</strong> y compartirá el mismo stock del
          inventario.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="precio_bebida">¿A cuánto la vendes?</Label>
        <Input
          id="precio_bebida"
          type="number"
          step="100"
          min="0"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="Precio de venta"
          autoFocus
          className="rounded-xl h-11 tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={crear} disabled={pending} className="w-full rounded-2xl h-11 gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CupSoda className="h-4 w-4" />}
          Sí, crear producto
        </Button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="w-full rounded-2xl p-2 text-sm text-muted-foreground hover:text-foreground"
        >
          No por ahora
        </button>
      </div>
    </div>
  );
}

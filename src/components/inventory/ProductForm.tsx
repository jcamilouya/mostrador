'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
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
import { Camera, Check, Loader2, Plus, Save, ArrowLeft, X } from 'lucide-react';
import type { Categoria, Producto } from '@/lib/inventario/queries';
import type { ActionState } from '@/lib/inventario/actions';
import { crearCategoria } from '@/lib/inventario/actions';

function SubmitButton({ creando }: { creando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="rounded-2xl gap-2" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Guardando…
        </>
      ) : (
        <>
          <Save className="h-4 w-4" />
          {creando ? 'Crear producto' : 'Guardar cambios'}
        </>
      )}
    </Button>
  );
}

function CatSubmitButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

const COLORES_RAPIDOS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#64748b',
];

export function ProductForm({
  action,
  categorias,
  producto,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  categorias: Categoria[];
  producto?: Producto;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {});

  const [previewUrl, setPreviewUrl] = useState<string | null>(producto?.imagen_url ?? null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false);
  const [colorCat, setColorCat] = useState('#6366f1');
  const [nombreCat, setNombreCat] = useState('');
  const [catState, setCatState] = useState<ActionState>({});
  const [catPending, startCat] = useTransition();

  // La creación de categoría NO usa un <form> anidado (HTML inválido):
  // dispara la Server Action directamente con useTransition.
  function handleCrearCategoria() {
    const nombre = nombreCat.trim();
    if (nombre.length < 2) {
      setCatState({ error: 'El nombre es muy corto' });
      return;
    }
    const fd = new FormData();
    fd.set('nombre', nombre);
    fd.set('color', colorCat);
    startCat(async () => {
      const res = await crearCategoria({}, fd);
      setCatState(res);
      if (res.ok) {
        setNombreCat('');
        setColorCat('#6366f1');
        setMostrarNuevaCat(false);
        router.refresh();
      }
    });
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuitarImagen(false);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleQuitarImagen() {
    setPreviewUrl(null);
    setQuitarImagen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden para quitar imagen */}
      {quitarImagen && <input type="hidden" name="quitar_imagen" value="1" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-4 lg:col-span-2">

          {/* Foto del producto */}
          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-3">
            <h2 className="font-semibold">Foto del producto</h2>
            <p className="text-xs text-muted-foreground">
              Se muestra en el POS al buscar y seleccionar productos.
            </p>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  name="imagen"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleImageChange}
                />
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-secondary flex items-center justify-center border-2 border-dashed border-border transition-colors hover:border-primary">
                  {previewUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Vista previa"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                        <Camera className="h-5 w-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Camera className="h-7 w-7" />
                      <span className="text-[10px] text-center leading-tight">Toca para<br />agregar</span>
                    </div>
                  )}
                </div>
              </label>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-secondary transition-colors"
                >
                  {previewUrl ? 'Cambiar foto' : 'Elegir foto'}
                </button>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleQuitarImagen}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-destructive transition-colors text-left"
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Información del producto */}
          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <h2 className="font-semibold">Información del producto</h2>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                name="nombre"
                defaultValue={producto?.nombre ?? ''}
                placeholder="Bandeja paisa"
                required
                className="rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                name="descripcion"
                defaultValue={producto?.descripcion ?? ''}
                placeholder="Plato típico con frijoles, arroz, carne, chicharrón, huevo, plátano…"
                className="rounded-xl min-h-24"
              />
            </div>

            {/* Categoría + crear inline */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="categoria_id">Categoría</Label>
                <button
                  type="button"
                  onClick={() => setMostrarNuevaCat((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                >
                  {mostrarNuevaCat ? (
                    <><X className="h-3 w-3" /> Cancelar</>
                  ) : (
                    <><Plus className="h-3 w-3" /> Nueva categoría</>
                  )}
                </button>
              </div>

              <Select name="categoria_id" defaultValue={producto?.categoria_id ?? undefined}>
                <SelectTrigger className="rounded-xl h-11" id="categoria_id">
                  <SelectValue placeholder={categorias.length === 0 ? 'Crea una categoría primero →' : 'Elige una categoría'} />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.nombre}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Panel inline para crear categoría (sin <form> anidado) */}
              {mostrarNuevaCat && (
                <div className="rounded-2xl border bg-secondary/40 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nueva categoría</p>
                  <div className="flex gap-2">
                    <Input
                      value={nombreCat}
                      onChange={(e) => setNombreCat(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCrearCategoria();
                        }
                      }}
                      placeholder="Ej: Bebidas, Snacks…"
                      className="rounded-xl h-9 text-sm flex-1"
                      autoFocus
                    />
                    <CatSubmitButton pending={catPending} onClick={handleCrearCategoria} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Color</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLORES_RAPIDOS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColorCat(c)}
                          className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c,
                            outline: colorCat === c ? `2px solid ${c}` : 'none',
                            outlineOffset: 2,
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={colorCat}
                        onChange={(e) => setColorCat(e.target.value)}
                        className="h-7 w-7 rounded-full cursor-pointer border-0 bg-transparent p-0"
                        title="Color personalizado"
                      />
                    </div>
                  </div>
                  {catState.error && (
                    <p className="text-xs text-destructive">{catState.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={producto?.sku ?? ''}
                  placeholder="Se genera automático si lo dejas vacío"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo_barras">Código de barras</Label>
                <Input
                  id="codigo_barras"
                  name="codigo_barras"
                  defaultValue={producto?.codigo_barras ?? ''}
                  placeholder="Opcional"
                  className="rounded-xl h-11"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Columna lateral: precios + stock */}
        <div className="space-y-4">
          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <h2 className="font-semibold">Precios</h2>
            <div className="space-y-2">
              <Label htmlFor="precio_compra">
                Precio de compra
                <span className="ml-1 text-xs text-muted-foreground">(lo que te cuesta)</span>
              </Label>
              <Input
                id="precio_compra"
                name="precio_compra"
                type="number"
                step="100"
                min="0"
                defaultValue={producto?.precio_compra ?? 0}
                className="rounded-xl h-11 tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precio_venta">
                Precio de venta *
                <span className="ml-1 text-xs text-muted-foreground">(lo que cobras)</span>
              </Label>
              <Input
                id="precio_venta"
                name="precio_venta"
                type="number"
                step="100"
                min="0"
                defaultValue={producto?.precio_venta ?? 0}
                required
                className="rounded-xl h-11 tabular-nums"
              />
            </div>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <h2 className="font-semibold">Inventario</h2>
            <div className="space-y-2">
              <Label htmlFor="stock_actual">Stock actual</Label>
              <Input
                id="stock_actual"
                name="stock_actual"
                type="number"
                min="0"
                defaultValue={producto?.stock_actual ?? 0}
                className="rounded-xl h-11 tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock_minimo">
                Stock mínimo
                <span className="ml-1 text-xs text-muted-foreground">(alerta)</span>
              </Label>
              <Input
                id="stock_minimo"
                name="stock_minimo"
                type="number"
                min="0"
                defaultValue={producto?.stock_minimo ?? 5}
                className="rounded-xl h-11 tabular-nums"
              />
            </div>
          </div>
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton creando={!producto} />
        <Link href="/dashboard/inventario">
          <Button type="button" variant="outline" className="rounded-2xl gap-2">
            <ArrowLeft className="h-4 w-4" />
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}

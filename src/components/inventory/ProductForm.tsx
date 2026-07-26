'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
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
import { Camera, Check, Loader2, Plus, Save, ArrowLeft, X, Layers, Trash2, Carrot } from 'lucide-react';
import type { Categoria, Producto } from '@/lib/inventario/queries';
import type { ActionState } from '@/lib/inventario/actions';
import { crearCategoria } from '@/lib/inventario/actions';
import { unidadCorta } from '@/lib/insumos/units';
import { formatCOP } from '@/lib/utils/format';

export type InsumoOpcion = { id: string; nombre: string; unidad: string; costo_unitario: number };

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

/**
 * Comprime/redimensiona una imagen en el navegador antes de subirla.
 * Evita que una foto de celular (varios MB) supere el límite de los Server
 * Actions y haga fallar el guardado. Si algo falla, devuelve el archivo original.
 */
async function comprimirImagen(file: File, maxDim = 1280, calidad = 0.8): Promise<File> {
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
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', calidad),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function ProductForm({
  action,
  categorias,
  producto,
  insumos = [],
  recetaInicial = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  categorias: Categoria[];
  producto?: Producto;
  insumos?: InsumoOpcion[];
  recetaInicial?: { insumo_id: string; cantidad: number }[];
}) {
  const [state, formAction] = useActionState(action, {});

  const [previewUrl, setPreviewUrl] = useState<string | null>(producto?.imagen_url ?? null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opciones / combos: el precio se maneja como string en el input.
  const [variantes, setVariantes] = useState<{ nombre: string; precio: string; bebida: boolean }[]>(
    (producto?.variantes ?? []).map((v) => ({
      nombre: v.nombre,
      precio: String(v.precio),
      bebida: v.bebida === true,
    })),
  );
  // Solo las opciones con nombre se envían (precio vacío = 0).
  const variantesLimpias = variantes
    .filter((v) => v.nombre.trim().length > 0)
    .map((v) => ({ nombre: v.nombre.trim(), precio: Number(v.precio) || 0, bebida: v.bebida }));

  // El producto base ("Sencillo") pide elegir bebida al venderlo.
  const [pideBebida, setPideBebida] = useState(producto?.pide_bebida === true);

  function agregarVariante() {
    setVariantes((prev) => [...prev, { nombre: '', precio: '', bebida: false }]);
  }
  function actualizarVariante(idx: number, campo: 'nombre' | 'precio', valor: string) {
    setVariantes((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [campo]: valor } : v)),
    );
  }
  function toggleVarianteBebida(idx: number) {
    setVariantes((prev) => prev.map((v, i) => (i === idx ? { ...v, bebida: !v.bebida } : v)));
  }
  function quitarVariante(idx: number) {
    setVariantes((prev) => prev.filter((_, i) => i !== idx));
  }

  // Receta: ingredientes que consume 1 unidad del producto.
  const [receta, setReceta] = useState<{ insumo_id: string; cantidad: string }[]>(
    recetaInicial.map((r) => ({ insumo_id: r.insumo_id, cantidad: String(r.cantidad) })),
  );
  const recetaLimpia = receta
    .filter((r) => r.insumo_id && Number(r.cantidad) > 0)
    .map((r) => ({ insumo_id: r.insumo_id, cantidad: Number(r.cantidad) }));
  const insumoUnidad = (id: string) => insumos.find((x) => x.id === id)?.unidad ?? '';

  function agregarReceta() {
    setReceta((prev) => [...prev, { insumo_id: '', cantidad: '' }]);
  }
  function actualizarReceta(idx: number, campo: 'insumo_id' | 'cantidad', valor: string) {
    setReceta((prev) => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  }
  function quitarReceta(idx: number) {
    setReceta((prev) => prev.filter((_, i) => i !== idx));
  }

  // Costo real de la receta (Σ cantidad × costo del insumo) y ganancia en vivo.
  const [precioVenta, setPrecioVenta] = useState(String(producto?.precio_venta ?? ''));
  const costoReceta = recetaLimpia.reduce((acc, r) => {
    const ins = insumos.find((x) => x.id === r.insumo_id);
    return acc + (ins ? r.cantidad * ins.costo_unitario : 0);
  }, 0);
  const precioNum = Number(precioVenta) || 0;
  const gananciaReceta = precioNum - costoReceta;
  const margenPct = precioNum > 0 ? Math.round((gananciaReceta / precioNum) * 100) : 0;

  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false);
  const [colorCat, setColorCat] = useState('#6366f1');
  const [nombreCat, setNombreCat] = useState('');
  const [catState, setCatState] = useState<ActionState>({});
  const [catPending, startCat] = useTransition();

  // Lista local de categorías para que la nueva aparezca al instante,
  // sin depender de un refresh del servidor.
  const [cats, setCats] = useState<Categoria[]>(categorias);
  const [categoriaId, setCategoriaId] = useState<string>(producto?.categoria_id ?? '');

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
      if (res.ok && res.categoria) {
        setCats((prev) =>
          [...prev, res.categoria!].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        );
        setCategoriaId(res.categoria.id);
        setNombreCat('');
        setColorCat('#6366f1');
        setMostrarNuevaCat(false);
        setCatState({ ok: true });
      } else {
        setCatState(res);
      }
    });
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuitarImagen(false);
    const comprimida = await comprimirImagen(file);
    // Reemplaza el archivo del input por la versión comprimida para que el
    // formulario envíe esa (más liviana) y no falle por tamaño.
    try {
      const dt = new DataTransfer();
      dt.items.add(comprimida);
      if (fileInputRef.current) fileInputRef.current.files = dt.files;
    } catch {
      // Algunos navegadores no permiten asignar files; el original se enviará.
    }
    setPreviewUrl(URL.createObjectURL(comprimida));
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

      {/* Opciones / combos serializadas a JSON */}
      <input type="hidden" name="variantes" value={JSON.stringify(variantesLimpias)} />
      {/* Receta (ingredientes) serializada a JSON */}
      <input type="hidden" name="receta" value={JSON.stringify(recetaLimpia)} />
      {/* El producto base pide elegir bebida al vender */}
      <input type="hidden" name="pide_bebida" value={pideBebida ? '1' : '0'} />

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

              <Select
                name="categoria_id"
                value={categoriaId || undefined}
                onValueChange={(v) => setCategoriaId(v ?? '')}
              >
                <SelectTrigger className="rounded-xl h-11" id="categoria_id">
                  <SelectValue placeholder={cats.length === 0 ? 'Crea una categoría primero →' : 'Elige una categoría'} />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
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

          {/* Opciones / combos */}
          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Layers className="h-4 w-4" /> Opciones / combos
                </h2>
                <p className="text-xs text-muted-foreground">
                  Para vender el mismo producto en varias presentaciones. Ej: una
                  hamburguesa “Con papas” o “Con papas y gaseosa”, cada una con su precio.
                </p>
              </div>
            </div>

            {variantes.length > 0 && (
              <div className="space-y-2">
                {/* Encabezados solo en pantallas grandes */}
                <div className="hidden grid-cols-[1fr_9rem_2.5rem] gap-2 px-1 sm:grid">
                  <span className="text-xs font-medium text-muted-foreground">Nombre de la opción</span>
                  <span className="text-xs font-medium text-muted-foreground">Precio</span>
                  <span />
                </div>
                {variantes.map((v, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="grid grid-cols-[1fr_2.5rem] items-center gap-2 sm:grid-cols-[1fr_9rem_2.5rem]">
                      <Input
                        value={v.nombre}
                        onChange={(e) => actualizarVariante(idx, 'nombre', e.target.value)}
                        placeholder="Con papas"
                        className="rounded-xl h-11 col-span-1 max-sm:col-start-1"
                      />
                      <Input
                        value={v.precio}
                        onChange={(e) => actualizarVariante(idx, 'precio', e.target.value)}
                        type="number"
                        step="100"
                        min="0"
                        placeholder="Precio"
                        className="rounded-xl h-11 tabular-nums max-sm:col-span-1"
                      />
                      <button
                        type="button"
                        onClick={() => quitarVariante(idx)}
                        className="flex h-11 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
                        aria-label="Quitar opción"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 pl-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={v.bebida}
                        onChange={() => toggleVarianteBebida(idx)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      🥤 Al vender esta opción se elige la bebida (se descuenta del Inventario)
                    </label>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={agregarVariante}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="h-4 w-4" /> Agregar opción
            </button>

            {variantes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Si no agregas opciones, el producto se vende solo con su precio normal.
              </p>
            )}

            {/* Bebida para el producto base ("Sencillo") */}
            <label className="flex cursor-pointer items-start gap-2 rounded-2xl bg-secondary/40 p-3 text-sm">
              <input
                type="checkbox"
                checked={pideBebida}
                onChange={(e) => setPideBebida(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>
                🥤 <strong>Este producto (opción &quot;Sencillo&quot;) incluye bebida a elegir.</strong>{' '}
                <span className="text-xs text-muted-foreground">
                  Al venderlo, el POS pregunta cuál bebida del Inventario y la descuenta.
                </span>
              </span>
            </label>
          </div>

          {/* Receta / ingredientes */}
          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Carrot className="h-4 w-4" /> Receta / Ingredientes
              </h2>
              <p className="text-xs text-muted-foreground">
                Qué ingredientes y cuánto usa <strong>1 unidad</strong> de este producto. Al
                venderlo, se descuentan solos del inventario de ingredientes.
              </p>
            </div>

            {insumos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Primero crea ingredientes en{' '}
                <Link href="/dashboard/insumos" className="text-primary underline">
                  Ingredientes
                </Link>{' '}
                y vuelve aquí para armar la receta.
              </p>
            ) : (
              <>
                {receta.length > 0 && (
                  <div className="space-y-2">
                    {receta.map((r, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2">
                        <select
                          value={r.insumo_id}
                          onChange={(e) => actualizarReceta(idx, 'insumo_id', e.target.value)}
                          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                        >
                          <option value="">Elige ingrediente…</option>
                          {insumos.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.nombre}
                            </option>
                          ))}
                        </select>
                        <div className="relative">
                          <Input
                            value={r.cantidad}
                            onChange={(e) => actualizarReceta(idx, 'cantidad', e.target.value)}
                            type="number"
                            step="any"
                            min="0"
                            placeholder="Cant."
                            className="rounded-xl h-11 tabular-nums pr-9"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {unidadCorta(insumoUnidad(r.insumo_id))}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarReceta(idx)}
                          className="flex h-11 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors"
                          aria-label="Quitar ingrediente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={agregarReceta}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Agregar ingrediente
                </button>

                {recetaLimpia.length > 0 &&
                  (costoReceta > 0 ? (
                    <div className="rounded-2xl bg-secondary/50 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Costo de la receta (por unidad)</span>
                        <span className="font-semibold tabular-nums">{formatCOP(costoReceta)}</span>
                      </div>
                      {precioNum > 0 && (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-muted-foreground">Ganancia por unidad</span>
                          <span
                            className={`font-semibold tabular-nums ${
                              gananciaReceta >= 0 ? 'text-[var(--ingreso)]' : 'text-[var(--egreso)]'
                            }`}
                          >
                            {formatCOP(gananciaReceta)} ({margenPct}%)
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ponle costo a tus ingredientes (en la sección Ingredientes) para ver cuánto te
                      cuesta hacer este producto y cuánto ganas.
                    </p>
                  ))}
              </>
            )}
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
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                required
                className="rounded-xl h-11 tabular-nums"
              />
            </div>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-sm space-y-4">
            <h2 className="font-semibold">Inventario</h2>
            {producto?.insumo_id ? (
              <p className="text-sm text-muted-foreground">
                🥤 El stock de este producto se controla desde{' '}
                <strong>Inventario → Bebidas</strong>. Es el mismo stock: al reponer inventario o
                vender, se sincroniza solo.
              </p>
            ) : (
              <>
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
              </>
            )}
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

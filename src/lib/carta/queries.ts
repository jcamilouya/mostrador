import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { faltaColumna } from '@/lib/supabase/errores';

export type ItemCarta = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  /** Combos/tamaños: cada uno con su precio completo, no un recargo. */
  opciones: { nombre: string; precio: number }[];
};

export type GrupoCarta = { categoria: string; items: ItemCarta[] };

export type CartaPublica = {
  negocio: string;
  telefono: string | null;
  direccion: string | null;
  grupos: GrupoCarta[];
};

/** La carta como la ve un cliente que escanea el QR de la mesa. */
export type ConfigCarta = {
  activa: boolean;
  slug: string | null;
  /** La migración 017 todavía no está corrida: la pantalla lo dice y no rompe. */
  faltaMigracion: boolean;
  productos: { id: string; nombre: string; precio: number; enCarta: boolean }[];
};

function normalizarOpciones(raw: unknown): { nombre: string; precio: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      const o = v as { nombre?: unknown; precio?: unknown };
      return { nombre: String(o?.nombre ?? ''), precio: Number(o?.precio ?? 0) };
    })
    .filter((o) => o.nombre && o.precio > 0);
}

/**
 * La carta pública de un negocio, por su slug. **No hay sesión**: la abre
 * cualquiera con el link, así que usa el cliente admin.
 *
 * Por eso mismo esta función es la más delicada de la app. Dos reglas que no se
 * tocan:
 *
 * 1) Solo responde si `carta_activa` es true. Un negocio que no encendió su
 *    carta no existe aquí, aunque adivinen su slug.
 *
 * 2) Solo se piden los campos que van impresos en la carta. NADA de costos
 *    (`precio_compra`), stock, ni ids de otras tablas. Si algún día hace falta
 *    otro campo, se agrega aquí a mano y se piensa dos veces.
 *
 * Va con `cache()` de React porque la piden `generateMetadata` Y la página en
 * el mismo request: sin eso era el mismo par de consultas dos veces por visita.
 */
export const getCartaPublica = cache(async (slug: string): Promise<CartaPublica | null> => {
  const admin = createAdminClient();

  const { data: empresa, error } = await admin
    .from('empresas')
    .select('id, nombre, telefono, direccion')
    .eq('carta_slug', slug)
    .eq('carta_activa', true)
    .maybeSingle();

  // Sin la migración 017 no hay cartas publicadas todavía: 404 limpio.
  if (error || !empresa) return null;

  const { data: productos } = await admin
    .from('productos')
    .select('id, nombre, descripcion, precio_venta, variantes, categoria_id, categorias (nombre)')
    .eq('empresa_id', empresa.id)
    .eq('activo', true)
    .eq('en_carta', true)
    .gt('precio_venta', 0)
    .order('nombre');

  const porCategoria = new Map<string, ItemCarta[]>();
  for (const p of productos ?? []) {
    const rel = (p as Record<string, unknown>).categorias;
    const cat = Array.isArray(rel) ? rel[0] : rel;
    const nombreCat = (cat as { nombre?: string } | null)?.nombre ?? 'Otros';

    const lista = porCategoria.get(nombreCat) ?? [];
    lista.push({
      id: p.id as string,
      nombre: p.nombre as string,
      descripcion: (p.descripcion as string | null) || null,
      precio: Number(p.precio_venta ?? 0),
      opciones: normalizarOpciones(p.variantes),
    });
    porCategoria.set(nombreCat, lista);
  }

  const grupos = [...porCategoria.entries()]
    .map(([categoria, items]) => ({ categoria, items }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'));

  return {
    negocio: empresa.nombre as string,
    telefono: (empresa.telefono as string | null) || null,
    direccion: (empresa.direccion as string | null) || null,
    grupos,
  };
});

/** Lo que necesita la pantalla del dueño para administrar su carta. */
export async function getConfigCarta(empresaId: string): Promise<ConfigCarta> {
  const supabase = await createClient();

  const [empresaRes, productosRes] = await Promise.all([
    supabase.from('empresas').select('carta_slug, carta_activa').eq('id', empresaId).maybeSingle(),
    supabase
      .from('productos')
      .select('id, nombre, precio_venta, en_carta')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('nombre'),
  ]);

  if (faltaColumna(empresaRes.error) || faltaColumna(productosRes.error)) {
    return { activa: false, slug: null, faltaMigracion: true, productos: [] };
  }

  return {
    activa: empresaRes.data?.carta_activa === true,
    slug: (empresaRes.data?.carta_slug as string | null) ?? null,
    faltaMigracion: false,
    productos: (productosRes.data ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      precio: Number(p.precio_venta ?? 0),
      enCarta: p.en_carta !== false,
    })),
  };
}

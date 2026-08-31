import { createClient } from '@/lib/supabase/server';
import { esNegocioDeMesas } from '@/components/shared/NavItems';

export type Tarea = {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
  cta: string;
  hecha: boolean;
};

/**
 * La lista de arranque del negocio. NO es un cartel: cada punto se marca solo
 * mirando la base de datos, así que nunca le dice "carga tus productos" a
 * alguien que ya tiene cuarenta.
 *
 * Se adapta a lo que vende: a una tienda no le pedimos cargar ingredientes.
 * Cuando está todo hecho devuelve la lista completa y quien la pinta la
 * esconde sola.
 */
export async function getTareasArranque(
  empresaId: string,
  categoria: string | null,
): Promise<Tarea[]> {
  const supabase = await createClient();
  const [productos, ventas, egresos, insumos, empresa] = await Promise.all([
    supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('activo', true),
    supabase
      .from('ventas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada'),
    supabase
      .from('egresos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    supabase
      .from('insumos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('activo', true),
    supabase.from('empresas').select('telefono, direccion').eq('id', empresaId).maybeSingle(),
  ]);

  const hayProductos = (productos.count ?? 0) > 0;
  const hayVentas = (ventas.count ?? 0) > 0;
  const hayEgresos = (egresos.count ?? 0) > 0;
  const hayInsumos = (insumos.count ?? 0) > 0;
  const datosListos = Boolean(empresa.data?.telefono || empresa.data?.direccion);

  const tareas: Tarea[] = [
    {
      id: 'productos',
      titulo: 'Carga lo que vendes',
      descripcion: 'Tómale una foto a tu carta y quedan cargados con su precio.',
      href: '/dashboard/inventario',
      cta: 'Cargar con una foto',
      hecha: hayProductos,
    },
    {
      id: 'venta',
      titulo: 'Haz tu primera venta',
      descripcion: 'Toca un producto, toca Cobrar y elige cómo te pagaron.',
      href: '/dashboard/pos',
      cta: 'Ir a vender',
      hecha: hayVentas,
    },
    {
      id: 'gasto',
      titulo: 'Registra un gasto',
      descripcion: 'Tómale foto a una factura y la app saca el proveedor y el monto.',
      href: '/dashboard/egresos/nuevo',
      cta: 'Registrar un gasto',
      hecha: hayEgresos,
    },
  ];

  // Solo a quien prepara comida le pedimos cargar ingredientes.
  if (esNegocioDeMesas(categoria)) {
    tareas.push({
      id: 'ingredientes',
      titulo: 'Carga tus ingredientes',
      descripcion: 'Para saber cuánto te cuesta cada plato y que se descuenten al vender.',
      href: '/dashboard/insumos',
      cta: 'Cargar ingredientes',
      hecha: hayInsumos,
    });
  }

  tareas.push({
    id: 'datos',
    titulo: 'Completa los datos de tu negocio',
    descripcion: 'Tu teléfono y dirección salen en los recibos que le mandas al cliente.',
    href: '/dashboard/configuracion',
    cta: 'Completar datos',
    hecha: datosListos,
  });

  return tareas;
}

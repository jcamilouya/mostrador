import { createClient } from '@/lib/supabase/server';
import { esNegocioDeMesas } from '@/components/shared/NavItems';
import type { Paso } from './pasos';

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

/** A partir de aquí el dueño ya sabe vender y podemos proponerle algo más. */
const VENTAS_PARA_SUGERIR = 5;

/**
 * El siguiente paso del negocio: UNA sola sugerencia, nunca una lista.
 *
 * Tres reglas, y las tres son deliberadas:
 *
 * 1) No aparece el primer día. Hasta que no haya vendido de verdad
 *    (`VENTAS_PARA_SUGERIR` ventas cobradas), lo único que importa es que
 *    aprenda a cobrar. Recetas, mesas y QR encima de eso son ruido.
 * 2) En modo práctica no aparece nunca: está jugando, no montando su negocio.
 * 3) Se devuelve UNA. Cinco sugerencias a la vez es una lista de tareas, y una
 *    lista de tareas al dueño de un restaurante no la lee nadie.
 *
 * Cada paso se marca hecho mirando la base de datos, así que desaparece solo y
 * no hay que acordarse de apagarlo.
 */
export async function getSiguientePaso(
  empresaId: string,
  categoria: string | null,
  opciones: { esPro: boolean; modoPractica: boolean; pospuestos: string[] },
): Promise<Paso | null> {
  if (opciones.modoPractica) return null;

  const supabase = await createClient();
  const soloCuenta = { count: 'exact' as const, head: true };

  const [ventas, recetas, conMesa, conTarjeta, productos, empresaRes] = await Promise.all([
    supabase
      .from('ventas')
      .select('id', soloCuenta)
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada'),
    supabase.from('producto_receta').select('id', soloCuenta).eq('empresa_id', empresaId),
    supabase
      .from('ventas')
      .select('id', soloCuenta)
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .not('mesa', 'is', null),
    supabase
      .from('ventas')
      .select('id', soloCuenta)
      .eq('empresa_id', empresaId)
      .eq('estado', 'completada')
      .eq('metodo_pago', 'tarjeta'),
    supabase
      .from('productos')
      .select('id', soloCuenta)
      .eq('empresa_id', empresaId)
      .eq('activo', true),
    supabase
      .from('empresas')
      .select('telefono, direccion, breb_llave, breb_qr_payload, recargo_tarjeta_pct')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  // Todavía está aprendiendo a cobrar: no distraerlo con nada más.
  if ((ventas.count ?? 0) < VENTAS_PARA_SUGERIR) return null;

  const empresa = (empresaRes.data ?? {}) as {
    telefono?: string | null;
    direccion?: string | null;
    breb_llave?: string | null;
    breb_qr_payload?: string | null;
    recargo_tarjeta_pct?: number | null;
  };

  const preparaComida = esNegocioDeMesas(categoria);
  const pasos: Paso[] = [];

  // 1. Recetas: lo que más plata le cambia. Sin receta, el margen que ve es mentira.
  if (preparaComida && (recetas.count ?? 0) === 0 && (productos.count ?? 0) > 0) {
    pasos.push({
      id: 'recetas',
      emoji: '🧮',
      titulo: '¿Sabes cuánto ganas en cada plato?',
      porque:
        'Ponle a un plato lo que lleva (pan, carne, salsa) y la app te dice lo que te cuesta y lo que te queda. De paso, los ingredientes se descuentan solos al vender.',
      cta: 'Ponerle receta a un plato',
      href: '/dashboard/inventario',
    });
  }

  // 2. Mesas: no es plata, es que dejen de anotar en papel.
  if (preparaComida && (conMesa.count ?? 0) === 0) {
    pasos.push({
      id: 'mesas',
      emoji: '🍽️',
      titulo: '¿Atiendes en mesas?',
      porque:
        'Guarda el pedido en una mesa, síguele agregando y cóbralo al final. Nada se descuenta del inventario hasta que cobras.',
      cta: 'Ver cómo funcionan',
      href: '/dashboard/mesas',
    });
  }

  // 3. Cobrar por QR. Solo si el plan lo incluye: no ofrecer lo que no puede usar.
  if (opciones.esPro && !empresa.breb_qr_payload && !empresa.breb_llave) {
    pasos.push({
      id: 'cobro-qr',
      emoji: '📲',
      titulo: 'Deja que te paguen con el celular',
      porque:
        'Sube la foto de tu QR de Bre-B una vez y queda en la pantalla de cobro. El cliente escanea y listo, sin efectivo ni datáfono.',
      cta: 'Subir mi QR',
      href: '/dashboard/configuracion',
    });
  }

  // 4. Datos del negocio: para que el recibo que manda no sea anónimo.
  if (!empresa.telefono || !empresa.direccion) {
    pasos.push({
      id: 'datos',
      emoji: '🧾',
      titulo: 'Que tus recibos lleven tus datos',
      porque:
        'Tu teléfono y tu dirección salen en el recibo que le mandas al cliente. Sin eso parece un papel de nadie.',
      cta: 'Completar mis datos',
      href: '/dashboard/configuracion',
    });
  }

  // 5. Recargo de tarjeta: solo tiene sentido si YA está cobrando con tarjeta.
  if ((conTarjeta.count ?? 0) > 0 && !empresa.recargo_tarjeta_pct) {
    pasos.push({
      id: 'recargo',
      emoji: '💳',
      titulo: '¿La tarjeta te está costando plata?',
      porque:
        'Puedes configurar el porcentaje que te cobra el datáfono para que se sume solo al cobrar con tarjeta. Ojo: en Colombia cobrarle el recargo al cliente va contra las reglas de las franquicias.',
      cta: 'Configurar el recargo',
      href: '/dashboard/configuracion',
    });
  }

  // Lo que dijo "ahora no" se salta y se propone el siguiente, no se calla todo.
  return pasos.find((p) => !opciones.pospuestos.includes(p.id)) ?? null;
}

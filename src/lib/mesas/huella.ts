/**
 * "Huella" de una cuenta abierta: cómo estaban sus platos cuando alguien la
 * abrió en el POS. Puro (sin Supabase): la calcula el navegador al cargar la
 * cuenta y el servidor al guardar/cobrar, con la MISMA regla.
 *
 * Por qué existe: guardar o cobrar REEMPLAZA los platos de la cuenta por los
 * del carrito. Con el celular del mesero y la caja trabajando a la vez, la caja
 * podía tener la Mesa 4 abierta, el mesero le agregaba una cerveza, y al cobrar
 * la caja reescribía la cuenta con su copia vieja: la cerveza desaparecía y no
 * se cobraba. Con la huella, el servidor ve que la cuenta cambió y lo rechaza
 * ("vuelve a abrirla"), en vez de perder lo que hizo el otro.
 */
export type LineaHuella = {
  producto_id: string | null;
  nombre_producto: string;
  cantidad: number | string;
  precio_unitario: number | string;
};

export function huellaCuenta(lineas: LineaHuella[]): string {
  return lineas
    .map((l) => `${l.producto_id ?? ''}|${l.nombre_producto}|${Number(l.cantidad)}|${Number(l.precio_unitario)}`)
    .sort()
    .join('\n');
}

export const CUENTA_CAMBIO =
  'Esta mesa cambió desde otro equipo (le agregaron o quitaron algo). Vuelve a abrirla en Mesas para ver lo último.';

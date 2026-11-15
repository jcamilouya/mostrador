'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Escucha cambios en ventas y egresos de la empresa vía Supabase Realtime y
 * refresca los Server Components de la ruta actual (KPIs, gráfico, analítica).
 * Hace debounce para no refrescar en ráfaga cuando llegan varios eventos juntos.
 */
export function RealtimeRefresher({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const refrescar = () => {
      // El POS se actualiza solo al terminar una venta, y refrescarlo en medio
      // de un cobro es peor que no refrescarlo: se marca como pendiente y se
      // aplica cuando el usuario salga de ahí.
      if (pathname.startsWith('/dashboard/pos')) {
        pendiente.current = true;
        return;
      }
      // Con la pestaña de fondo no hay nada que mirar: se aplaza.
      if (typeof document !== 'undefined' && document.hidden) {
        pendiente.current = true;
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      // Debounce largo: en hora pico entran varias ventas seguidas y cada
      // refresh vuelve a correr todas las consultas de la pantalla.
      timer.current = setTimeout(() => {
        pendiente.current = false;
        router.refresh();
      }, 1500);
    };

    // Al volver a la pestaña, ponerse al día una sola vez.
    const alVolver = () => {
      if (!document.hidden && pendiente.current) {
        pendiente.current = false;
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', alVolver);

    // UN CANAL POR TABLA, a propósito. Si una tabla no está en la publicación
    // de Realtime, Supabase rechaza el canal ENTERO ("Unable to subscribe…").
    // Estuvieron juntas ventas + egresos, `egresos` no estaba publicada, y la
    // actualización en vivo de ventas nunca funcionó en producción sin que
    // nadie lo notara. Separadas, la que falte no tumba a las demás.
    const filtro = `empresa_id=eq.${empresaId}`;
    const tablas = ['ventas', 'egresos'];
    // Plano del salón (021): reservas y cambios de mesas, solo en Mesas.
    if (pathname.startsWith('/dashboard/mesas')) tablas.push('salon_piezas');
    // Comandas (023): la pantalla de cocina ve llegar cada pedido.
    if (pathname.startsWith('/dashboard/cocina')) tablas.push('comandas');

    let cancelado = false;
    let canales: ReturnType<typeof supabase.channel>[] = [];

    // PRIMERO la sesión, DESPUÉS los canales. El cliente del navegador lee la
    // sesión de las cookies sin apuro, y si el canal se une antes, se une como
    // ANÓNIMO: Realtime aplica RLS (solo `authenticated` puede leer) y no
    // entrega NINGÚN cambio, sin dar error. Comprobado en el websocket: los
    // joins salían sin access_token. Los refrescos del token después de esto
    // los propaga supabase-js solo.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelado) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      canales = tablas.map((tabla) =>
        supabase
          .channel(`mostrador-${tabla}-${empresaId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: filtro }, refrescar)
          .subscribe(),
      );
    })();

    return () => {
      cancelado = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', alVolver);
      canales.forEach((c) => supabase.removeChannel(c));
    };
  }, [empresaId, router, pathname]);

  return null;
}

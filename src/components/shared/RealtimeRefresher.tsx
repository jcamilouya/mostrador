'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Escucha cambios en ventas y egresos de la empresa vía Supabase Realtime y
 * refresca los Server Components de la ruta actual (KPIs, gráfico, analítica).
 * Hace debounce para no refrescar en ráfaga cuando llegan varios eventos juntos.
 */
export function RealtimeRefresher({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const refrescar = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };

    const filtro = `empresa_id=eq.${empresaId}`;
    const channel = supabase
      .channel(`mostrador-${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas', filter: filtro }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos', filter: filtro }, refrescar)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [empresaId, router]);

  return null;
}

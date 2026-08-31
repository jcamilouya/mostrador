'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GraduationCap, Loader2, Check } from 'lucide-react';
import { terminarPractica } from '@/lib/practica/actions';

/**
 * Franja permanente mientras el negocio está practicando.
 *
 * No se puede cerrar a propósito: el peor final posible es un dueño que cree que
 * está vendiendo de verdad y al otro día no encuentra su plata. Mientras esté
 * encendido, se ve.
 */
export function BannerPractica() {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [pending, startTransition] = useTransition();

  function terminar() {
    startTransition(async () => {
      const res = await terminarPractica();
      if (res.ok) {
        setConfirmar(false);
        toast.success('¡Listo! Ahora sí, tus ventas quedan registradas 💪');
        router.refresh();
      } else {
        toast('No se pudo cambiar', { description: res.error });
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--utilidad)]/30 bg-[var(--utilidad)]/15 px-4 py-2.5 lg:px-8">
        <span className="flex items-center gap-2 text-sm font-medium">
          <GraduationCap className="h-4 w-4 shrink-0" />
          Estás practicando
        </span>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          Vende, cobra y equivócate tranquilo: nada de esto se guarda en tus cuentas.
        </span>
        <Button
          size="sm"
          className="shrink-0 rounded-xl"
          onClick={() => setConfirmar(true)}
        >
          Ya entendí, empezar de verdad
        </Button>
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>¿Empezamos de verdad?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              De aquí en adelante cada venta <strong className="text-foreground">sí</strong>{' '}
              queda registrada: suma a tu caja del día y descuenta tu inventario.
            </p>
            <p className="text-sm text-muted-foreground">
              Lo que vendiste practicando no se guardó en ningún lado, así que tus cuentas
              arrancan en cero. Si más adelante quieres volver a practicar —para enseñarle
              a alguien nuevo— lo prendes otra vez en Ajustes.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                onClick={terminar}
                disabled={pending}
                className="h-12 w-full rounded-2xl gap-2"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Sí, empezar a vender de verdad
              </Button>
              <button
                type="button"
                onClick={() => setConfirmar(false)}
                disabled={pending}
                className="w-full rounded-2xl p-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Sigo practicando un rato
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

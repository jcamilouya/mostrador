'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eliminarCliente } from '@/lib/clientes/actions';

export function DeleteClienteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-xl gap-2 text-[var(--egreso)] hover:bg-[var(--egreso)]/10"
      disabled={pending}
      onClick={() => {
        if (!confirm('¿Eliminar este cliente? Sus ventas no se borran, solo se desvinculan.')) return;
        startTransition(async () => {
          await eliminarCliente(id);
          router.push('/dashboard/clientes');
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
      Eliminar
    </Button>
  );
}

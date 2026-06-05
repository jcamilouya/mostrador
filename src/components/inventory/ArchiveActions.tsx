'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Archive, Trash2 } from 'lucide-react';
import { archivarProducto, eliminarProducto } from '@/lib/inventario/actions';

export function ArchiveActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl gap-2"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await archivarProducto(id);
            router.push('/dashboard/inventario');
          })
        }
      >
        <Archive className="h-4 w-4" />
        Archivar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl gap-2 text-[var(--egreso)] hover:bg-[var(--egreso)]/10"
        disabled={pending}
        onClick={() => {
          if (!confirm('¿Eliminar este producto? No se puede deshacer.')) return;
          startTransition(async () => {
            await eliminarProducto(id);
            router.push('/dashboard/inventario');
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </Button>
    </div>
  );
}

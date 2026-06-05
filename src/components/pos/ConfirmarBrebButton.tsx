'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { confirmarVentaBreb } from '@/lib/breb/actions';

export function ConfirmarBrebButton({ ventaId }: { ventaId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setError(false);
          const res = await confirmarVentaBreb(ventaId);
          if (res.ok) router.refresh();
          else setError(true);
        })
      }
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--ingreso)]/15 px-2.5 py-1 text-xs font-medium text-[var(--ingreso)] transition-colors hover:bg-[var(--ingreso)]/25 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Check className="h-3 w-3" />
      )}
      {error ? 'Reintentar' : 'Ya me pagó'}
    </button>
  );
}

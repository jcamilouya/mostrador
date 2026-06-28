'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Lleva al usuario a `next` automáticamente tras confirmar el correo. */
export function AutoRedirect({ next, delayMs = 2200 }: { next: string; delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(next), delayMs);
    return () => clearTimeout(t);
  }, [router, next, delayMs]);
  return null;
}

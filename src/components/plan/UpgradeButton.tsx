'use client';

import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

export function UpgradeButton({ label = 'Mejorar a Pro' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        toast('Pagos en línea muy pronto', {
          description:
            'Estamos conectando Wompi para que pagues con PSE o tarjeta. Te avisamos apenas esté listo.',
        })
      }
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-medium text-background"
    >
      <Sparkles className="h-4 w-4" /> {label}
    </button>
  );
}

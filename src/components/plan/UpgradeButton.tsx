'use client';

import { useState } from 'react';
import Script from 'next/script';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

// Widget de Wompi (lo inyecta checkout.wompi.co/widget.js)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class WidgetCheckout {
    constructor(options: Record<string, any>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    open(callback: (result: any) => void): void;
  }
}

export function UpgradeButton({
  label = 'Mejorar a Pro',
  plan = 'pro',
}: {
  label?: string;
  plan?: 'basico' | 'pro';
}) {
  const [loading, setLoading] = useState(false);

  async function pagar() {
    setLoading(true);
    try {
      const res = await fetch('/api/checkout/wompi/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        toast('No pudimos iniciar el pago', { description: 'Intenta de nuevo en un momento.' });
        setLoading(false);
        return;
      }
      const data = await res.json();

      if (!data.llavePublica || typeof WidgetCheckout === 'undefined') {
        toast('Pagos aún no disponibles', {
          description: 'Falta conectar las llaves de Wompi. Te avisamos apenas esté listo.',
        });
        setLoading(false);
        return;
      }

      const checkout = new WidgetCheckout({
        currency: data.moneda,
        amountInCents: data.montoCentavos,
        reference: data.referencia,
        publicKey: data.llavePublica,
        redirectUrl: data.redirectUrl,
        signature: { integrity: data.firmaIntegridad },
      });

      checkout.open((result) => {
        const estado = result?.transaction?.status;
        const status =
          estado === 'APPROVED' ? 'success' : estado === 'PENDING' ? 'pending' : 'failed';
        window.location.href = `${data.redirectUrl}?status=${status}`;
      });
    } catch {
      toast('Algo salió mal', { description: 'No pudimos abrir el pago. Intenta de nuevo.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Script src="https://checkout.wompi.co/widget.js" strategy="afterInteractive" />
      <button
        type="button"
        onClick={pagar}
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-medium text-background disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {label}
      </button>
    </>
  );
}

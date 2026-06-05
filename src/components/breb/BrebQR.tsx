'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode as QrIcon, Loader2 } from 'lucide-react';
import { construirPayloadBreb } from '@/lib/breb/emv';

export function BrebQR({
  llave,
  nombre,
  monto,
  referencia,
  size = 208,
}: {
  llave: string;
  nombre: string;
  monto?: number;
  referencia?: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    if (!llave) {
      setSrc(null);
      return;
    }
    setError(false);
    const payload = construirPayloadBreb({ llave, nombre, monto, referencia });
    QRCode.toDataURL(payload, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => activo && setSrc(url))
      .catch(() => activo && setError(true));
    return () => {
      activo = false;
    };
  }, [llave, nombre, monto, referencia, size]);

  if (!llave) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-secondary text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <QrIcon className="h-16 w-16" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-secondary p-4 text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        No pudimos generar el QR
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-secondary"
        style={{ width: size, height: size }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Código QR Bre-B"
      width={size}
      height={size}
      className="rounded-2xl bg-white p-2"
    />
  );
}

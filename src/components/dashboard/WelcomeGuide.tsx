'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, QrCode, ShoppingCart, X, Sparkles } from 'lucide-react';

const KEY = 'mostrador_bienvenida_v1';

const PASOS = [
  {
    icon: Package,
    titulo: '1. Carga tus productos',
    desc: 'Agrega lo que vendes con su precio y foto.',
    href: '/dashboard/inventario/nuevo',
    cta: 'Agregar producto',
  },
  {
    icon: QrCode,
    titulo: '2. Activa tu cobro Bre-B',
    desc: 'Pon tu llave y cobra por QR desde cualquier banco.',
    href: '/dashboard/configuracion',
    cta: 'Configurar Bre-B',
  },
  {
    icon: ShoppingCart,
    titulo: '3. ¡A vender!',
    desc: 'Registra ventas en segundos desde el POS.',
    href: '/dashboard/pos',
    cta: 'Abrir el POS',
  },
];

export function WelcomeGuide() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      // localStorage no disponible — no mostramos para no molestar.
    }
  }, []);

  if (!show) return null;

  function cerrar() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignorar
    }
    setShow(false);
  }

  return (
    <section
      className="relative rounded-3xl p-5 shadow-sm"
      style={{ backgroundColor: 'color-mix(in oklch, var(--utilidad) 10%, var(--card))' }}
    >
      <button
        onClick={cerrar}
        className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5" style={{ color: 'var(--utilidad)' }} />
        <h2 className="text-lg font-semibold">¡Bienvenido a Mostrador! Empieza en 3 pasos</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PASOS.map((p) => {
          const Icon = p.icon;
          return (
            <Link
              key={p.href}
              href={p.href}
              className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm transition-transform hover:scale-[1.02]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--utilidad)]/15">
                <Icon className="h-4 w-4 text-[var(--utilidad)]" />
              </span>
              <p className="font-medium">{p.titulo}</p>
              <p className="flex-1 text-xs text-muted-foreground">{p.desc}</p>
              <span className="text-xs font-medium text-[var(--utilidad)]">{p.cta} →</span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={cerrar}
        className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Entendido, no mostrar de nuevo
      </button>
    </section>
  );
}

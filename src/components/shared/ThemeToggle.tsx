'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const oscuro = montado && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(oscuro ? 'light' : 'dark')}
      aria-label="Cambiar tema"
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${className}`}
    >
      {oscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {oscuro ? 'Modo claro' : 'Modo oscuro'}
    </button>
  );
}

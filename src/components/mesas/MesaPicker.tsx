'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, ShoppingBag, Bike, Loader2, Check } from 'lucide-react';

const RAPIDOS = [
  { label: 'Para llevar', icon: ShoppingBag },
  { label: 'Domicilio', icon: Bike },
  { label: 'Barra', icon: UtensilsCrossed },
];

/**
 * Elegir a qué mesa va la cuenta. Antes esto era un `window.prompt` del
 * navegador: un recuadro gris que no se parece en nada a la app y que en el
 * celular obliga a escribir. Aquí se toca el número y listo.
 */
export function MesaPicker({
  open,
  valorInicial,
  guardando,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  valorInicial?: string | null;
  guardando?: boolean;
  onCancel: () => void;
  onConfirm: (mesa: string) => void;
}) {
  const [valor, setValor] = useState(valorInicial ?? '');

  useEffect(() => {
    if (open) setValor(valorInicial ?? '');
  }, [open, valorInicial]);

  const listo = valor.trim().length > 0;

  function confirmar(texto?: string) {
    const final = (texto ?? valor).trim();
    if (!final) return;
    onConfirm(final);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>¿A qué mesa va?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Números: lo que usa un mesero el 90% de las veces */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const etiqueta = `Mesa ${n}`;
              const activo = valor.trim().toLowerCase() === etiqueta.toLowerCase();
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setValor(etiqueta)}
                  onDoubleClick={() => confirmar(etiqueta)}
                  className={`flex h-16 items-center justify-center rounded-2xl text-xl font-semibold tabular-nums transition-transform active:scale-95 ${
                    activo
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-foreground hover:bg-secondary/70'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {/* Casos que no son mesa */}
          <div className="flex flex-wrap gap-2">
            {RAPIDOS.map((r) => {
              const activo = valor.trim().toLowerCase() === r.label.toLowerCase();
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setValor(r.label)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition-colors ${
                    activo
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <r.icon className="h-4 w-4" />
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Cualquier otro nombre */}
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmar();
              }
            }}
            placeholder="O escribe otro nombre: Terraza 2, Juan…"
            className="h-12 rounded-2xl"
            maxLength={60}
          />

          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-semibold gap-2"
            disabled={!listo || guardando}
            onClick={() => confirmar()}
          >
            {guardando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            {listo ? `Guardar en ${valor.trim()}` : 'Elige una mesa'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

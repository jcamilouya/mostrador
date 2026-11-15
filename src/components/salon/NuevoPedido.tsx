'use client';

import { useState } from 'react';
import { Bike, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DomicilioCuenta } from '@/lib/mesas/queries';

const PAGOS: { v: DomicilioCuenta['pago']; t: string }[] = [
  { v: 'efectivo', t: 'Efectivo' },
  { v: 'tarjeta', t: 'Tarjeta' },
  { v: 'breb', t: 'Bre-B' },
  { v: 'transferencia', t: 'Transferencia' },
];

/** Botones "Para llevar" y "Domicilio" del salón, con sus formularios. */
export function NuevoPedido({
  puedeLlevar,
  onLlevar,
  onDomicilio,
}: {
  /** Para llevar se cobra de una: solo quien puede cobrar. */
  puedeLlevar: boolean;
  onLlevar: (nombre: string | null) => void;
  onDomicilio: (d: DomicilioCuenta) => void;
}) {
  const [abierto, setAbierto] = useState<'llevar' | 'domicilio' | null>(null);

  return (
    <>
      <div className="flex gap-2">
        {puedeLlevar && (
          <Button variant="outline" className="h-9 rounded-xl gap-1.5" onClick={() => setAbierto('llevar')}>
            <ShoppingBag className="h-3.5 w-3.5" /> Para llevar
          </Button>
        )}
        <Button variant="outline" className="h-9 rounded-xl gap-1.5" onClick={() => setAbierto('domicilio')}>
          <Bike className="h-3.5 w-3.5" /> Domicilio
        </Button>
      </div>

      <Dialog open={abierto === 'llevar'} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Pedido para llevar</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = String(new FormData(e.currentTarget).get('nombre') ?? '').trim();
              setAbierto(null);
              onLlevar(n || null);
            }}
          >
            <Input name="nombre" autoFocus maxLength={40} placeholder="Nombre (opcional)" className="h-12 rounded-2xl" />
            <p className="text-xs text-muted-foreground">Se cobra ahora y la comanda sale a cocina.</p>
            <Button type="submit" className="h-12 w-full rounded-2xl">
              Elegir productos
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <FormDomicilio
        abierto={abierto === 'domicilio'}
        onCerrar={() => setAbierto(null)}
        onListo={(d) => {
          setAbierto(null);
          onDomicilio(d);
        }}
      />
    </>
  );
}

function FormDomicilio({
  abierto,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onListo: (d: DomicilioCuenta) => void;
}) {
  const [canal, setCanal] = useState<DomicilioCuenta['canal']>('whatsapp');
  const [pago, setPago] = useState<DomicilioCuenta['pago']>('efectivo');
  const [error, setError] = useState('');

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo domicilio</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const nombre = String(f.get('nombre') ?? '').trim();
            const telefono = String(f.get('telefono') ?? '').replace(/[^\d+]/g, '');
            const direccion = String(f.get('direccion') ?? '').trim();
            const nota = String(f.get('nota') ?? '').trim();
            if (!nombre) return setError('¿A nombre de quién va?');
            if (!/^\+?\d{7,15}$/.test(telefono)) return setError('Revisa el celular (7 a 15 números)');
            if (direccion.length < 4) return setError('Falta la dirección');
            setError('');
            onListo({ nombre, telefono, direccion, canal, pago, nota: nota || null });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(['whatsapp', 'llamada'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCanal(c)}
                className={`h-11 rounded-2xl text-sm font-medium ${
                  canal === c ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {c === 'whatsapp' ? 'Por WhatsApp' : 'Por llamada'}
              </button>
            ))}
          </div>
          <Input name="nombre" autoFocus maxLength={60} placeholder="Nombre del cliente" className="h-12 rounded-2xl" />
          <Input
            name="telefono"
            type="tel"
            inputMode="tel"
            maxLength={20}
            placeholder="Celular"
            className="h-12 rounded-2xl"
          />
          <Input name="direccion" maxLength={160} placeholder="Dirección (barrio, apto…)" className="h-12 rounded-2xl" />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">¿Cómo paga?</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PAGOS.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setPago(p.v)}
                  className={`h-10 rounded-xl text-xs font-medium ${
                    pago === p.v ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {p.t}
                </button>
              ))}
            </div>
          </div>
          <Input name="nota" maxLength={200} placeholder="Nota (opcional): devuelta de $50.000, timbre…" className="h-12 rounded-2xl" />
          {error && <p className="text-sm text-[var(--egreso)]">{error}</p>}
          <Button type="submit" className="h-12 w-full rounded-2xl">
            Elegir productos
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

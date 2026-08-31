'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Plus } from 'lucide-react';
import { CartaPorFoto } from './CartaPorFoto';

/**
 * Las dos formas de cargar productos: de a uno a mano, o toda la carta de una
 * foto. La foto va primero porque es la que le ahorra la tarde al dueño.
 */
export function AgregarProductos({ vacio = false }: { vacio?: boolean }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="rounded-2xl gap-2" onClick={() => setAbierto(true)}>
          <Camera className="h-4 w-4" />
          {vacio ? 'Cargar mi carta con una foto' : 'Agregar con foto'}
        </Button>
        <Link href="/dashboard/inventario/nuevo">
          <Button size="lg" variant="outline" className="rounded-2xl gap-2">
            <Plus className="h-4 w-4" />
            {vacio ? 'Agregar uno a mano' : 'Agregar producto'}
          </Button>
        </Link>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Cargar productos con una foto</DialogTitle>
          </DialogHeader>
          <CartaPorFoto onListo={() => setAbierto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClienteState } from '@/lib/clientes/actions';
import type { Cliente } from '@/lib/clientes/queries';

function SubmitButton({ editar }: { editar: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full rounded-2xl gap-2 sm:w-auto" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
        </>
      ) : editar ? (
        'Guardar cambios'
      ) : (
        'Crear cliente'
      )}
    </Button>
  );
}

export function ClienteForm({
  action,
  cliente,
}: {
  action: (prev: ClienteState, formData: FormData) => Promise<ClienteState>;
  cliente?: Cliente;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ClienteState, FormData>(action, {});

  // Inputs controlados: evita el warning de Base UI cuando la revalidación
  // tras guardar reemplaza el defaultValue de un campo no-controlado.
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [notas, setNotas] = useState(cliente?.notas ?? '');

  useEffect(() => {
    if (state.ok && !cliente) {
      router.push('/dashboard/clientes');
    }
  }, [state.ok, cliente, router]);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input
            id="nombre"
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del cliente"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="310 555 1234"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            name="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Lo que quieras recordar de este cliente…"
            className="rounded-xl"
            rows={3}
          />
        </div>
      </section>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-4 py-3 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}
      {state.ok && cliente && (
        <p className="flex items-center gap-2 rounded-xl bg-[var(--ingreso)]/10 px-4 py-3 text-sm text-[var(--ingreso)]">
          <Check className="h-4 w-4" /> Cambios guardados.
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton editar={Boolean(cliente)} />
      </div>
    </form>
  );
}

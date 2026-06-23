'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { guardarNotas, type AdminActionState } from '@/lib/admin/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="h-10 rounded-xl gap-2" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Guardar notas
    </Button>
  );
}

export function NotasForm({
  empresaId,
  notas,
}: {
  empresaId: string;
  notas: string | null;
}) {
  const action = guardarNotas.bind(null, empresaId);
  const [state, formAction] = useActionState<AdminActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <Textarea
        name="notas_internas"
        defaultValue={notas ?? ''}
        placeholder="Notas internas de soporte (solo las ves tú)…"
        className="min-h-24 rounded-xl"
      />
      {state.error && (
        <p className="text-sm text-[var(--egreso)]">{state.error}</p>
      )}
      {state.ok && <p className="text-sm text-[var(--ingreso)]">Notas guardadas.</p>}
      <SubmitButton />
    </form>
  );
}

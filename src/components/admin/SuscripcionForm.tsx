'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { guardarSuscripcion, type AdminActionState } from '@/lib/admin/actions';
import type { Plan } from '@/lib/plan/queries';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-10 rounded-xl gap-2" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Guardar plan
    </Button>
  );
}

export function SuscripcionForm({
  empresaId,
  plan,
  expiraEn,
}: {
  empresaId: string;
  plan: Plan;
  expiraEn: string | null;
}) {
  const action = guardarSuscripcion.bind(null, empresaId);
  const [state, formAction] = useActionState<AdminActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan">Plan</Label>
          <Select name="plan" defaultValue={plan}>
            <SelectTrigger id="plan" className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="basico">Básico</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan_expira_en">Vence / pagado hasta</Label>
          <Input
            id="plan_expira_en"
            name="plan_expira_en"
            type="date"
            defaultValue={expiraEn ? expiraEn.slice(0, 10) : ''}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl bg-[var(--egreso)]/10 px-3 py-2 text-sm text-[var(--egreso)]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-xl bg-[var(--ingreso)]/10 px-3 py-2 text-sm text-[var(--ingreso)]">
          Plan actualizado.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

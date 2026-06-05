'use client';

import { signOut } from '@/lib/auth/actions';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </form>
  );
}

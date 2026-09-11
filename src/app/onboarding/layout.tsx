import Link from 'next/link';
import { Store, LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/actions';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="rounded-xl bg-card p-2 shadow-sm">
            <Store className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">Mostrador</span>
        </Link>

        {/*
          Salida de emergencia. Sin esto, quien entra con una cuenta que aún no
          tiene negocio queda encerrado: /login y /register lo devuelven al
          dashboard, el dashboard lo devuelve aquí, y aquí no había botón de
          salir. Pasó de verdad: una cuenta nueva no pudo ni registrarse ni
          volver a entrar con la del negocio.
        */}
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Entrar con otra cuenta
          </button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

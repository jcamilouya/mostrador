import Link from 'next/link';
import { Store } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="rounded-xl bg-card p-2 shadow-sm">
            <Store className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">Mostrador</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        Hecho en Colombia 🇨🇴 — para quien lleva su negocio en la cabeza.
      </footer>
    </div>
  );
}

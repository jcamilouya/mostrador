import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { getSuperAdmin } from '@/lib/admin/auth';

export const metadata: Metadata = {
  title: 'Panel Admin — Mostrador',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getSuperAdmin();
  if (!admin) notFound();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Panel Admin</p>
              <p className="text-[11px] text-muted-foreground">{admin.email}</p>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-secondary">
              Resumen
            </Link>
            <Link href="/admin/empresas" className="rounded-lg px-3 py-1.5 hover:bg-secondary">
              Empresas
            </Link>
            <Link
              href="/dashboard"
              className="ml-1 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-secondary"
            >
              Mi dashboard <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

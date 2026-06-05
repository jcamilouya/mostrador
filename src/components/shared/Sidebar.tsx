'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Store } from 'lucide-react';
import { NAV_ITEMS } from './NavItems';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar({ negocio }: { negocio: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-sidebar lg:px-4 lg:py-6">
      <Link href="/dashboard" className="mb-8 inline-flex items-center gap-2 px-2">
        <span className="rounded-xl bg-card p-2 shadow-sm">
          <Store className="h-5 w-5" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">Mostrador</span>
          <span className="truncate text-xs text-muted-foreground">{negocio}</span>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-1 border-t pt-4">
        <ThemeToggle className="w-full justify-start" />
        <SignOutButton />
      </div>
    </aside>
  );
}

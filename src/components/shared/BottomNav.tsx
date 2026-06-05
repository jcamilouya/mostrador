'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, X } from 'lucide-react';
import { BOTTOM_PRIMARY, MORE_ITEMS } from './NavItems';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const moreActivo = MORE_ITEMS.some((i) => pathname.startsWith(i.href));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 px-1 pt-2 backdrop-blur lg:hidden" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <ul className="flex items-stretch justify-around gap-0.5">
          {BOTTOM_PRIMARY.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/dashboard'
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] transition-colors ${
                    active ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'scale-110' : ''} transition-transform`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] transition-colors ${
                moreActivo ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-in fade-in" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-background p-4 pb-8 shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Menú</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                      active
                        ? 'bg-foreground text-background'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-2 flex flex-col gap-1 border-t pt-2">
              <ThemeToggle className="w-full justify-start" />
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

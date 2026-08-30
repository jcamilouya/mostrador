import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { House } from 'lucide-react';

/** 404 en español. Por defecto Next muestra "This page could not be found". */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-3xl bg-card px-6 py-14 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-3xl">
          🔍
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Esta página no existe</h1>
          <p className="text-sm text-muted-foreground">
            Puede que la hayas borrado o que el enlace esté viejo.
          </p>
        </div>
        <Link href="/dashboard">
          <Button className="h-11 rounded-2xl gap-2">
            <House className="h-4 w-4" /> Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}

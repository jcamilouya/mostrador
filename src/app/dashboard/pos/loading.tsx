/** Carga del POS: la pantalla que más se toca en el día, con su propia forma. */
export default function POSLoading() {
  return (
    <div
      className="-mx-4 -my-6 flex min-h-[calc(100vh-4rem)] animate-pulse lg:-mx-8 lg:-my-8"
      aria-busy="true"
    >
      <span className="sr-only">Cargando el punto de venta…</span>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 lg:px-8 lg:py-8">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-xl bg-secondary" />
          <div className="h-4 w-64 rounded-lg bg-secondary/60" />
        </div>

        {/* Filtros de categoría */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-secondary/70" />
          ))}
        </div>

        {/* Cuadrícula de productos */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-sm">
              <div className="aspect-[5/4] rounded-xl bg-secondary" />
              <div className="h-4 w-3/4 rounded bg-secondary/60" />
              <div className="h-4 w-1/2 rounded bg-secondary/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Carrito (solo en pantalla grande) */}
      <aside className="hidden w-96 flex-col gap-4 border-l bg-sidebar p-6 lg:flex">
        <div className="h-6 w-28 rounded-lg bg-secondary" />
        <div className="flex-1 rounded-2xl bg-secondary/40" />
        <div className="h-12 rounded-2xl bg-secondary" />
      </aside>
    </div>
  );
}

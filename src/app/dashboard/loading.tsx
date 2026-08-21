/**
 * Pantalla de carga de TODO el dashboard.
 *
 * Sin esto, al tocar una opción del menú el navegador se quedaba con la
 * pantalla vieja congelada hasta que el servidor terminaba (medido: 400–900 ms),
 * y se sentía como si la app se hubiera trabado. Al existir este archivo, Next
 * crea una frontera de suspense y pinta esto de inmediato: el toque siempre
 * responde. Aplica a todas las rutas de /dashboard que no traigan la suya.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-6" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      {/* Título */}
      <div className="space-y-2">
        <div className="h-8 w-52 rounded-xl bg-secondary" />
        <div className="h-4 w-72 rounded-lg bg-secondary/60" />
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-3xl bg-card p-5 shadow-sm">
            <div className="h-3 w-20 rounded bg-secondary/70" />
            <div className="h-7 w-28 rounded-lg bg-secondary" />
          </div>
        ))}
      </div>

      {/* Bloque grande */}
      <div className="rounded-3xl bg-card p-5 shadow-sm">
        <div className="h-4 w-40 rounded bg-secondary/70" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-secondary" />
              <div className="h-4 flex-1 rounded bg-secondary/60" />
              <div className="h-4 w-16 shrink-0 rounded bg-secondary/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

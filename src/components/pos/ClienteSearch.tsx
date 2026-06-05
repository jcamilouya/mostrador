'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Search, X, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/stores/cart-store';
import { buscarClientes, crearCliente, type ClienteMini } from '@/lib/clientes/actions';

export function ClienteSearch() {
  const cliente = useCart((s) => s.cliente);
  const setCliente = useCart((s) => s.setCliente);

  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ClienteMini[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [creando, startCrear] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Búsqueda con debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await buscarClientes(query);
      setResultados(data);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function seleccionar(c: ClienteMini) {
    setCliente({ id: c.id, nombre: c.nombre, telefono: c.telefono });
    setQuery('');
    setResultados([]);
    setAbierto(false);
  }

  function crearNuevo() {
    const nombre = query.trim();
    if (!nombre) return;
    startCrear(async () => {
      const res = await crearCliente({ nombre });
      if (res.ok && res.clienteId) {
        seleccionar({ id: res.clienteId, nombre, telefono: null });
        toast.success(`Cliente "${nombre}" creado`);
      } else {
        toast.error(res.error ?? 'No pudimos crear el cliente');
      }
    });
  }

  // Cliente ya seleccionado → mostrar chip
  if (cliente) {
    return (
      <div className="border-t pt-3">
        <p className="mb-1 text-xs text-muted-foreground">Cliente</p>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium">
            {cliente.nombre}
            {cliente.telefono && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {cliente.telefono}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setCliente(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Quitar cliente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-3" ref={boxRef}>
      <p className="mb-1 text-xs text-muted-foreground">Cliente (opcional)</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar por nombre o número…"
          className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
        />

        {abierto && query.trim().length >= 2 && (
          <div className="absolute bottom-full z-20 mb-1 w-full overflow-hidden rounded-xl border bg-background shadow-lg">
            {resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => seleccionar(c)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span className="truncate">{c.nombre}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.telefono}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={crearNuevo}
              disabled={creando}
              className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-secondary"
            >
              {creando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Crear cliente “{query.trim()}”
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

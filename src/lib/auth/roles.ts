/**
 * Roles del equipo (migración 023). Puro: lo usan el proxy (rutas), el menú
 * (qué se muestra) y el servidor (qué se permite). UNA sola tabla de verdad.
 *
 *  - dueno:  todo.
 *  - caja:   vender, cobrar, mesas, cocina, clientes, ingresos (sin anular).
 *  - mesero: mesas, tomar pedidos, marchar, cocina. Cobra solo si el dueño lo
 *            activa (`empresas.mesero_cobra`).
 */
export type Rol = 'dueno' | 'caja' | 'mesero';

export type Permiso =
  | 'atender' // tomar pedidos, marchar, pedir la cuenta, cambiar/juntar mesas, reservar
  | 'cobrar' // cerrar una venta (POS o mesa)
  | 'anular' // anular una cuenta abierta
  | 'clientes' // crear/editar clientes
  | 'administrar'; // productos, gastos, ingredientes, carta, plano, ajustes, equipo, reportes

export function normalizarRol(v: unknown): Rol {
  return v === 'caja' || v === 'mesero' ? v : 'dueno';
}

export function puede(rol: Rol, permiso: Permiso, meseroCobra = false): boolean {
  if (rol === 'dueno') return true;
  switch (permiso) {
    case 'atender':
      return true;
    case 'cobrar':
      return rol === 'caja' || meseroCobra;
    case 'anular':
    case 'clientes':
      return rol === 'caja';
    case 'administrar':
      return false;
  }
}

/** Rutas del dashboard que ve cada rol (el dueño, todas). */
const RUTAS: Record<Exclude<Rol, 'dueno'>, string[]> = {
  mesero: ['/dashboard/mesas', '/dashboard/pos', '/dashboard/cocina'],
  caja: [
    '/dashboard/mesas',
    '/dashboard/pos',
    '/dashboard/cocina',
    '/dashboard/clientes',
    '/dashboard/ingresos',
  ],
};

/** A dónde llega cada rol al entrar. */
export function inicioDe(rol: Rol): string {
  return rol === 'dueno' ? '/dashboard' : '/dashboard/mesas';
}

export function rutaPermitida(rol: Rol, pathname: string): boolean {
  if (rol === 'dueno') return true;
  return RUTAS[rol].some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Dominio de los usuarios del equipo: entran con "carlos.sabore" sin correo. */
export const DOMINIO_EQUIPO = 'equipo.mostrador.app';

export const NOMBRE_ROL: Record<Rol, string> = {
  dueno: 'Dueño',
  caja: 'Caja',
  mesero: 'Mesero',
};

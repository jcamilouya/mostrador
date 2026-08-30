import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  TrendingUp,
  Receipt,
  BarChart3,
  FileText,
  Users,
  Sparkles,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

/**
 * NOMBRES (decisión del dueño, no tocar sin avisar):
 * - "Productos" = lo que el negocio VENDE.        → /dashboard/inventario
 * - "Ingredientes" = lo que USA para prepararlo.  → /dashboard/insumos
 * Antes la segunda se llamaba "Inventario" y chocaba con la tarjeta del Inicio
 * que también decía "Inventario" pero llevaba a Productos: quien buscaba
 * "Inventario" llegaba a dos sitios distintos según de dónde leyera.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/dashboard/pos', label: 'Vender', icon: ShoppingCart },
  { href: '/dashboard/mesas', label: 'Mesas', icon: UtensilsCrossed },
  { href: '/dashboard/inventario', label: 'Productos', icon: Package },
  { href: '/dashboard/insumos', label: 'Ingredientes', icon: Warehouse },
  { href: '/dashboard/ingresos', label: 'Ingresos', icon: TrendingUp },
  { href: '/dashboard/egresos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/analitica', label: 'Analítica', icon: BarChart3 },
  { href: '/dashboard/reportes', label: 'Reportes', icon: FileText },
  { href: '/dashboard/plan', label: 'Plan', icon: Sparkles },
  { href: '/dashboard/configuracion', label: 'Ajustes', icon: Settings },
];

const ITEM_INICIO: NavItem = { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard };
const ITEM_VENDER: NavItem = { href: '/dashboard/pos', label: 'Vender', icon: ShoppingCart };
const ITEM_GASTOS: NavItem = { href: '/dashboard/egresos', label: 'Gastos', icon: Receipt };
const ITEM_MESAS: NavItem = { href: '/dashboard/mesas', label: 'Mesas', icon: UtensilsCrossed };
const ITEM_PRODUCTOS: NavItem = { href: '/dashboard/inventario', label: 'Productos', icon: Package };
const ITEM_INGREDIENTES: NavItem = { href: '/dashboard/insumos', label: 'Ingredientes', icon: Warehouse };
const ITEM_INGRESOS: NavItem = { href: '/dashboard/ingresos', label: 'Ingresos', icon: TrendingUp };
const ITEM_CLIENTES: NavItem = { href: '/dashboard/clientes', label: 'Clientes', icon: Users };
const ITEM_ANALITICA: NavItem = { href: '/dashboard/analitica', label: 'Analítica', icon: BarChart3 };
const ITEM_REPORTES: NavItem = { href: '/dashboard/reportes', label: 'Reportes', icon: FileText };
const ITEM_PLAN: NavItem = { href: '/dashboard/plan', label: 'Plan', icon: Sparkles };
const ITEM_AJUSTES: NavItem = { href: '/dashboard/configuracion', label: 'Ajustes', icon: Settings };

/** Negocios que atienden en mesa: el cuarto botón del celular es Mesas. */
const CON_MESAS = ['restaurante', 'cafeteria', 'cafetería', 'bar', 'panaderia', 'panadería'];

export function esNegocioDeMesas(categoria?: string | null): boolean {
  if (!categoria) return false;
  const c = categoria
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return CON_MESAS.some((x) => c.includes(x.normalize('NFD').replace(/[̀-ͯ]/g, '')));
}

/**
 * Los 4 botones fijos del celular (el 5º es "Más"). Dependen de lo que venda el
 * negocio: un restaurante abre Mesas cada cinco minutos, una tienda nunca.
 * Analítica NO va aquí: está detrás del plan Pro y un usuario Básico se topaba
 * con una pared de pago como cuarto botón principal.
 */
export function bottomPrimary(categoria?: string | null): NavItem[] {
  const cuarto = esNegocioDeMesas(categoria) ? ITEM_MESAS : ITEM_PRODUCTOS;
  return [ITEM_INICIO, ITEM_VENDER, ITEM_GASTOS, cuarto];
}

/** El resto, en el menú "Más": todo lo que no quedó fijo abajo. */
export function moreItems(categoria?: string | null): NavItem[] {
  const fijos = new Set(bottomPrimary(categoria).map((i) => i.href));
  return [
    ITEM_MESAS,
    ITEM_PRODUCTOS,
    ITEM_INGREDIENTES,
    ITEM_INGRESOS,
    ITEM_CLIENTES,
    ITEM_ANALITICA,
    ITEM_REPORTES,
    ITEM_PLAN,
    ITEM_AJUSTES,
  ].filter((i) => !fijos.has(i.href));
}

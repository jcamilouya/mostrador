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
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/dashboard/pos', label: 'Vender', icon: ShoppingCart },
  { href: '/dashboard/inventario', label: 'Productos', icon: Package },
  { href: '/dashboard/insumos', label: 'Inventario', icon: Warehouse },
  { href: '/dashboard/ingresos', label: 'Ingresos', icon: TrendingUp },
  { href: '/dashboard/egresos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/analitica', label: 'Analítica', icon: BarChart3 },
  { href: '/dashboard/reportes', label: 'Reportes', icon: FileText },
  { href: '/dashboard/plan', label: 'Plan', icon: Sparkles },
  { href: '/dashboard/configuracion', label: 'Ajustes', icon: Settings },
];

// Items principales de la barra inferior en móvil (el 5º es el botón "Más").
export const BOTTOM_PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/dashboard/pos', label: 'Vender', icon: ShoppingCart },
  { href: '/dashboard/egresos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/analitica', label: 'Analítica', icon: BarChart3 },
];

// Resto de secciones, accesibles desde el menú "Más" en móvil.
export const MORE_ITEMS: NavItem[] = [
  { href: '/dashboard/inventario', label: 'Productos', icon: Package },
  { href: '/dashboard/insumos', label: 'Inventario', icon: Warehouse },
  { href: '/dashboard/ingresos', label: 'Ingresos', icon: TrendingUp },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/reportes', label: 'Reportes', icon: FileText },
  { href: '/dashboard/plan', label: 'Plan', icon: Sparkles },
  { href: '/dashboard/configuracion', label: 'Ajustes', icon: Settings },
];

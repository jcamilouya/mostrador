export const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

export const formatNumber = (n: number) =>
  new Intl.NumberFormat('es-CO').format(n);

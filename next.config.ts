import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/dashboard/vender',    destination: '/dashboard/pos',           permanent: true },
      { source: '/dashboard/productos', destination: '/dashboard/inventario',     permanent: true },
      { source: '/dashboard/gastos',    destination: '/dashboard/egresos',        permanent: true },
      { source: '/dashboard/ajustes',   destination: '/dashboard/configuracion',  permanent: true },
    ];
  },
};

export default nextConfig;

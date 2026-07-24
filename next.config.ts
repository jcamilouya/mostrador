import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Las fotos de producto se suben dentro de un Server Action. El límite por
    // defecto (1MB) hace fallar el guardado con fotos de celular. Además del
    // límite, comprimimos la imagen en el navegador antes de enviarla.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async redirects() {
    return [
      { source: '/dashboard/vender',    destination: '/dashboard/pos',           permanent: true },
      { source: '/dashboard/productos', destination: '/dashboard/inventario',     permanent: true },
      { source: '/dashboard/gastos',    destination: '/dashboard/egresos',        permanent: true },
      { source: '/dashboard/ajustes',   destination: '/dashboard/configuracion',  permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

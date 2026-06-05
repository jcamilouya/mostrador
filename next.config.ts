import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActionsBodySizeLimit: '4mb',
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Permite continuar aunque existan errores TS durante build.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

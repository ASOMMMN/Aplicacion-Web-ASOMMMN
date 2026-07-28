import type { NextConfig } from "next";

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const isDev = process.env.NODE_ENV === "development";

// CSP sin nonces (patrón documentado por Next.js para apps con render estático/
// ISR): un CSP con nonces obliga a "dynamic rendering" en TODAS las páginas
// (ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
// lo que rompería la generación estática que hoy usan la mayoría de las rutas
// de esta app. 'unsafe-inline' en script-src es necesario porque el App Router
// inyecta scripts inline para hidratar el payload de RSC en cada página.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src 'self' ${apiOrigin}`,
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  typescript: {
    // Permite continuar aunque existan errores TS durante build.
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

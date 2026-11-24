import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!rawApiUrl && !isDev) {
  throw new Error(
    "NEXT_PUBLIC_API_URL no está configurada. Requerida para el build de producción (CSP connect-src).",
  );
}
const apiOrigin = (rawApiUrl ?? "http://localhost:3001").replace(/\/$/, "");

// Host del bucket S3 (sin esquema) donde se guardan los archivos. Las
// vistas previas (certificados, documentos personales, CV) embeben la URL
// firmada de S3 directamente en <iframe>/<img>, así que el CSP necesita
// permitir ESTE host exacto en frame-src/img-src (nunca un wildcard tipo
// "*.amazonaws.com"): sin esto, el navegador bloquea el iframe/imagen y se
// ve como "archivo roto" aunque la URL firmada sea válida.
const s3Host =
  process.env.NEXT_PUBLIC_S3_HOST ??
  "asommmn-reclutamiento.s3.us-east-2.amazonaws.com";

// CSP sin nonces (patrón documentado por Next.js para apps con render estático/
// ISR): un CSP con nonces obliga a "dynamic rendering" en TODAS las páginas
// (ver node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
// lo que rompería la generación estática que hoy usan la mayoría de las rutas
// de esta app. 'unsafe-inline' en script-src es necesario porque el App Router
// inyecta scripts inline para hidratar el payload de RSC en cada página.
// Cloudflare Turnstile (captcha de login, registro y recuperar contraseña):
// el script, el iframe del widget y sus peticiones salen de este origen
// exacto. Solo se agrega a script-src, frame-src y connect-src.
const turnstileOrigin = "https://challenges.cloudflare.com";

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
      `script-src 'self' 'unsafe-inline' ${turnstileOrigin}${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://${s3Host}`,
      `connect-src 'self' ${apiOrigin} ${turnstileOrigin}`,
      "font-src 'self'",
      "object-src 'none'",
      `frame-src 'self' https://${s3Host} ${turnstileOrigin}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Raíz del monorepo (donde viven package-lock.json y el node_modules con
  // `next`). Desde Next 16.4 la detección automática se detiene en el
  // repositorio Git más cercano: un .git suelto dentro de apps/web deja la
  // raíz en apps/web y el build no encuentra los paquetes hoisted. Next usa
  // el mismo valor para outputFileTracingRoot; en Netlify coincide con la
  // raíz que ya detectaba (la del package-lock.json), así que ahí no cambia.
  turbopack: { root: path.join(__dirname, "..", "..") },
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

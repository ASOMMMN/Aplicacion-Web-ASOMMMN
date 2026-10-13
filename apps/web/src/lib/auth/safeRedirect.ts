/**
 * Valida que `path` sea una ruta interna segura para redirigir tras el login
 * (evita open redirect vía `//host`, `/\host`, URLs absolutas o con protocolo).
 */
export function rutaRedirectSegura(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  if (path.includes('://')) return null;
  return path;
}

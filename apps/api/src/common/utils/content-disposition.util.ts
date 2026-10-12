/**
 * Construye un header Content-Disposition que muestra correctamente nombres
 * de archivo con acentos/ñ en el navegador. Incluye tanto el parámetro
 * `filename` clásico (fallback para clientes viejos) como `filename*`
 * (RFC 5987/6266), que es el que los navegadores modernos usan para
 * decodificar el nombre como UTF-8 en vez de mostrarlo tal cual o
 * percent-encoded.
 */
export function construirContentDisposition(
  disposicion: 'inline' | 'attachment',
  nombreArchivo: string,
): string {
  const fallback = nombreArchivo.replace(/"/g, "'");
  return `${disposicion}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`;
}

/**
 * Construye el nombre de carpeta "Nombre_Apellido" usado para organizar los
 * archivos de un postulante en S3. Sin acentos, sin espacios ni caracteres
 * especiales. Devuelve null si no hay nombre/apellidos disponibles, para que
 * el llamador use el id como fallback y no rompa el upload.
 */
export function construirCarpetaPorNombre(
  nombre?: string | null,
  apellidos?: string | null,
): string | null {
  const completo = `${nombre ?? ''} ${apellidos ?? ''}`.trim();
  if (!completo) return null;

  const slug = completo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return slug || null;
}

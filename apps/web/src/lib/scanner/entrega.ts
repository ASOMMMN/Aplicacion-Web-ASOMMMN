/**
 * Entrega del documento escaneado: genera el PDF y lo pasa a quien lo sube,
 * distinguiendo en qué fase falló. Si falla la subida, el PDF ya generado se
 * devuelve para reintentar sin volver a comprimir las páginas.
 */
export type ResultadoEntrega<T> =
  | { ok: true; archivo: T }
  | { ok: false; fase: 'pdf'; mensaje: string }
  | { ok: false; fase: 'subida'; mensaje: string; archivo: T };

export const MENSAJE_ERROR_PDF = 'No se pudo generar el PDF. Intenta de nuevo.';

/** Mensaje de un error de subida; quien sube lanza un Error con el texto que debe verse. */
export function mensajeErrorSubida(err: unknown): string {
  const detalle = err instanceof Error ? err.message.trim() : '';
  const base = detalle
    ? `No se pudo subir el documento: ${/[.!?]$/.test(detalle) ? detalle : `${detalle}.`}`
    : 'No se pudo subir el documento.';
  return `${base} Tus páginas se conservaron: toca “Usar este documento” para reintentar.`;
}

export async function entregarDocumento<T>(opciones: {
  /** PDF generado en un intento anterior que falló al subirse; null si no hay. */
  existente: T | null;
  generar: () => Promise<T>;
  entregar: (archivo: T) => Promise<void>;
}): Promise<ResultadoEntrega<T>> {
  let archivo = opciones.existente;
  if (archivo === null) {
    try {
      archivo = await opciones.generar();
    } catch {
      return { ok: false, fase: 'pdf', mensaje: MENSAJE_ERROR_PDF };
    }
  }
  try {
    await opciones.entregar(archivo);
    return { ok: true, archivo };
  } catch (err) {
    return { ok: false, fase: 'subida', mensaje: mensajeErrorSubida(err), archivo };
  }
}

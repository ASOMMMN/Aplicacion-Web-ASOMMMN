/**
 * Detecta el tipo real de un archivo por sus primeros bytes (firma/"magic
 * bytes"), en vez de confiar en `file.mimetype` — ese valor lo manda el
 * cliente en el multipart/form-data y es trivial falsificarlo (ej. un
 * .exe o .html renombrado a .pdf con mimetype "application/pdf").
 *
 * Solo cubre los tipos que la plataforma acepta en subidas de documentos
 * (CV, documentos personales): PDF, JPEG y PNG.
 */
export type TipoArchivoDetectado =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | null;

const FIRMAS: { tipo: Exclude<TipoArchivoDetectado, null>; bytes: number[] }[] =
  [
    { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
    { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    {
      tipo: 'image/png',
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
  ];

export function detectarTipoArchivo(buffer: Buffer): TipoArchivoDetectado {
  for (const firma of FIRMAS) {
    if (
      buffer.length >= firma.bytes.length &&
      firma.bytes.every((byte, i) => buffer[i] === byte)
    ) {
      return firma.tipo;
    }
  }
  return null;
}

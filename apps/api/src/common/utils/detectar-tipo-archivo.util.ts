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

/** Tipo que se guarda cuando el contenido no coincide con ninguna firma conocida. */
export const TIPO_DESCONOCIDO = 'application/octet-stream';

/**
 * Firmas extra que solo se usan para ETIQUETAR lo que se guarda en las
 * nubes (mi-nube, archivos del evaluador), que aceptan cualquier archivo.
 * No amplían lo que aceptan las subidas de documentos (detectarTipoArchivo).
 */
const FIRMAS_PARA_GUARDAR: {
  tipo: string;
  coincide: (b: Buffer) => boolean;
}[] = [
  {
    tipo: 'image/gif',
    coincide: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)),
  },
  {
    // "RIFF" + tamaño (4 bytes) + "WEBP"
    tipo: 'image/webp',
    coincide: (b) =>
      b.length >= 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP',
  },
];

/**
 * Tipo a guardar (y con el que después se sirve el archivo) según su
 * contenido real, nunca según `file.mimetype`: un .html subido como
 * "image/png" no debe servirse como página. Lo no reconocido se guarda como
 * application/octet-stream, que el navegador descarga en vez de mostrar.
 */
export function tipoParaGuardar(buffer: Buffer): string {
  return (
    detectarTipoArchivo(buffer) ??
    FIRMAS_PARA_GUARDAR.find((f) => f.coincide(buffer))?.tipo ??
    TIPO_DESCONOCIDO
  );
}

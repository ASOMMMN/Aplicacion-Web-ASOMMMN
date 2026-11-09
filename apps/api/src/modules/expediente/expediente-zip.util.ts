/**
 * Utilidades puras del "Descargar todo (ZIP)" del expediente: nombres de
 * carpetas/archivos dentro del ZIP y el LEEME.txt de lo que no se incluyó.
 * Sin dependencias de Nest/Mongo para poder probarlas aisladas.
 */

export const CARPETA_DOCS_PERSONALES = '01_Documentos_personales';
export const CARPETA_CURSOS = '02_Cursos_y_certificaciones';
export const CARPETA_CV = '03_CV';

/** Largo máximo de cada parte del nombre (sin extensión) para no rebasar MAX_PATH en Windows. */
const MAX_PREFIJO = 50;
const MAX_BASE = 80;
const MAX_EXTENSION = 10;

/** Extensión por tipo MIME cuando el nombre original no trae una. */
const EXTENSION_POR_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

/**
 * Deja un segmento de ruta seguro para cualquier sistema operativo y para
 * cualquier descompresor: sin acentos ni ñ, sin separadores de ruta, sin
 * `..`, sin caracteres de control ni reservados de Windows (<>:"/\|?*).
 * Espacios y símbolos se vuelven `_`.
 */
export function sanearSegmento(
  texto: string | null | undefined,
  maxLargo = MAX_BASE,
): string {
  const limpio = (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    // Rachas de separadores ("_._", "..", "-_"): un solo "_" (o el carácter, si es uno solo repetido).
    .replace(/[._-]{2,}/g, (racha) =>
      racha.includes('_') || new Set(racha).size > 1 ? '_' : racha[0],
    )
    .replace(/^[._-]+|[._-]+$/g, '');
  return limpio.slice(0, maxLargo).replace(/[._-]+$/g, '');
}

/** Separa "nombre.pdf" en { base: "nombre", extension: ".pdf" } (extensión ya saneada, en minúsculas). */
export function separarExtension(
  nombreOriginal: string | null | undefined,
  tipoMime?: string | null,
): { base: string; extension: string } {
  const nombre = (nombreOriginal ?? '').trim();
  const punto = nombre.lastIndexOf('.');
  const extCruda = punto > 0 ? nombre.slice(punto + 1) : '';
  const ext = sanearSegmento(extCruda, MAX_EXTENSION).toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) {
    return { base: nombre.slice(0, punto), extension: `.${ext}` };
  }
  return {
    base: nombre,
    extension: EXTENSION_POR_MIME[(tipoMime ?? '').toLowerCase()] ?? '',
  };
}

/**
 * Nombre del archivo dentro del ZIP: el tipo de documento al inicio y luego
 * el nombre original (`CURP_mi_curp.pdf`). Si el nombre original ya empieza
 * con el tipo no se repite (`CURP.pdf`, no `CURP_CURP.pdf`) y se escribe con
 * la forma del catálogo (`ine_frente.pdf` → `INE_frente.pdf`).
 */
export function nombreArchivoZip(
  prefijoTipo: string,
  nombreOriginal: string | null | undefined,
  tipoMime?: string | null,
): string {
  const prefijo = sanearSegmento(prefijoTipo, MAX_PREFIJO) || 'Documento';
  const { base, extension } = separarExtension(nombreOriginal, tipoMime);
  const baseSaneada = sanearSegmento(base, MAX_BASE);
  const yaTienePrefijo =
    baseSaneada.toLowerCase() === prefijo.toLowerCase() ||
    baseSaneada.toLowerCase().startsWith(`${prefijo.toLowerCase()}_`);
  const cuerpo = !baseSaneada
    ? prefijo
    : yaTienePrefijo
      ? `${prefijo}${baseSaneada.slice(prefijo.length)}`
      : `${prefijo}_${baseSaneada}`;
  return `${cuerpo}${extension}`;
}

/**
 * Carpeta raíz del ZIP: APELLIDOS_NOMBRES del aspirante, en mayúsculas y
 * saneada. Si no hay nombre se usa el id del postulante.
 */
export function nombreCarpetaRaiz(
  apellidos: string | null | undefined,
  nombre: string | null | undefined,
  respaldo: string,
): string {
  const completo = [apellidos, nombre]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return (
    sanearSegmento(completo, 100).toUpperCase() ||
    `POSTULANTE_${sanearSegmento(respaldo, 40)}`
  );
}

/**
 * Asigna nombres únicos por carpeta: si ya existe `CURP.pdf` el siguiente es
 * `CURP_2.pdf`, luego `CURP_3.pdf`... La comparación ignora mayúsculas porque
 * Windows y macOS no distinguen `cv.pdf` de `CV.pdf` al descomprimir.
 */
export class NombresUnicos {
  private readonly usados = new Set<string>();

  reservar(carpeta: string, nombre: string): string {
    const punto = nombre.lastIndexOf('.');
    const base = punto > 0 ? nombre.slice(0, punto) : nombre;
    const extension = punto > 0 ? nombre.slice(punto) : '';
    let candidato = nombre;
    for (
      let n = 2;
      this.usados.has(`${carpeta}/${candidato}`.toLowerCase());
      n++
    ) {
      candidato = `${base}_${n}${extension}`;
    }
    this.usados.add(`${carpeta}/${candidato}`.toLowerCase());
    return candidato;
  }
}

export interface ArchivoNoIncluido {
  /** Ruta que habría tenido dentro del ZIP (relativa a la carpeta raíz). */
  ruta: string;
  motivo: string;
}

/**
 * LEEME.txt con lo que no se pudo incluir. Con BOM UTF-8 y saltos CRLF para
 * que el Bloc de notas de Windows muestre bien los acentos.
 */
export function construirLeeme(
  nombreAspirante: string,
  noIncluidos: ArchivoNoIncluido[],
  generadoEn: Date,
): Buffer {
  const lineas = [
    'ARCHIVOS QUE NO SE PUDIERON INCLUIR EN ESTA DESCARGA',
    '',
    `Aspirante: ${nombreAspirante}`,
    `Generado: ${generadoEn.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    '',
    `Total no incluidos: ${noIncluidos.length}`,
    '',
    ...noIncluidos.map(
      (a, i) => `${i + 1}. ${a.ruta}\r\n   Motivo: ${a.motivo}`,
    ),
    '',
    'El resto de los documentos sí está en este ZIP. Para los que faltan,',
    'pide al aspirante que los vuelva a subir o revisa el expediente en la plataforma.',
    '',
  ];
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(lineas.join('\r\n'), 'utf8'),
  ]);
}

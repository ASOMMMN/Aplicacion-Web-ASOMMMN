import type { ModoMejora } from './tipos';

/**
 * Parámetros del escáner. Ajustar aquí el balance calidad/peso y la
 * sensibilidad de la detección (ver la sección "Escáner de documentos" del
 * Manual Técnico).
 */
export const CONFIG_ESCANER = {
  /** Lado largo máximo al decodificar la foto. Nunca se crea un canvas a resolución completa (iOS limita ~16.7 MP). */
  ladoMaxEntrada: 2400,
  /** Lado largo de la copia reducida sobre la que se detectan los bordes. */
  ladoDeteccion: 512,
  /** Lado largo máximo de cada página ya enderezada. */
  ladoMaxSalida: 2000,
  /**
   * La compresión adaptativa nunca reduce una página por debajo de este lado
   * largo: el QR y la MRZ de la INE/pasaporte deben seguir legibles.
   */
  ladoMinLegible: 1400,

  /** Calidad JPEG inicial (0–1). */
  calidadJpeg: 0.85,
  /** Calidad mínima a la que puede bajar la compresión adaptativa. */
  calidadMinima: 0.6,
  /** Cuánto baja la calidad en cada intento. */
  pasoCalidad: 0.08,
  /** Factor de reducción de tamaño cuando ya se llegó a la calidad mínima. */
  factorReduccion: 0.85,
  /** Tamaño orientativo del PDF completo. Si no se alcanza sin bajar de los mínimos, se acepta más grande. */
  tamanoObjetivoBytes: 2 * 1024 * 1024,

  /** El análisis IA del servidor lee como máximo 8 páginas (IA_DOCS_MAX_PAGINAS). */
  maxPaginas: 8,
  /** Resolución nominal con la que se calcula el tamaño físico de cada página del PDF. */
  dpiPdf: 200,

  /** Si la detección tarda más que esto, se usa el rectángulo de respaldo. */
  timeoutDeteccionMs: 5000,
  /** Margen (fracción de cada lado) del rectángulo de respaldo. */
  margenRespaldo: 0.08,
  /** Confianza mínima para aceptar los bordes detectados. */
  umbralConfianza: 0.45,

  /**
   * Tras entrar a la revisión se ignoran "Repetir" y "Agregar página" durante
   * este tiempo: un segundo toque de "Continuar" cae sobre ellos apenas aparece
   * el pie con 3 botones y devolvía al usuario a la captura.
   */
  ventanaToqueTrasRevisionMs: 500,

  modoPorDefecto: 'color' as ModoMejora,
} as const;

export type ConfigEscaner = typeof CONFIG_ESCANER;

/**
 * Lectura de un documento para enviarlo al modelo de visión.
 *
 * - Imagen (JPG/PNG): se envía tal cual.
 * - PDF con poco texto extraíble (escaneado / foto): se renderizan las
 *   primeras páginas a PNG y se envían como imágenes.
 * - PDF con texto: se envía el texto Y la imagen de la primera página (el
 *   texto de pdf-parse pierde la relación etiqueta ↔ fecha en tablas y
 *   documentos bilingües; la imagen permite confirmarla).
 *
 * Si el render falla (p. ej. falta el binario de @napi-rs/canvas), se
 * devuelve modo 'pdf-crudo' para que el llamador envíe el PDF completo.
 */
import { PDFParse } from 'pdf-parse';

export interface ConfiguracionLectura {
  /** Menos caracteres que esto (en las páginas leídas) = PDF escaneado. */
  umbralCaracteresTexto: number;
  /** Máximo de páginas que se leen y renderizan. */
  maxPaginas: number;
  /** Ancho en píxeles al renderizar cada página. */
  anchoPx: number;
  /** Máximo de caracteres de texto que se envían al modelo. */
  maxCaracteresTexto: number;
}

export const CONFIG_LECTURA_POR_DEFECTO: ConfiguracionLectura = {
  umbralCaracteresTexto: 200,
  maxPaginas: 4,
  anchoPx: 1600,
  maxCaracteresTexto: 12000,
};

/**
 * Lee la configuración de variables de entorno (opcionales):
 * IA_DOCS_UMBRAL_TEXTO, IA_DOCS_MAX_PAGINAS, IA_DOCS_ANCHO_PX,
 * IA_DOCS_MAX_CARACTERES_TEXTO.
 */
export function configLecturaDesdeEnv(
  leer: (clave: string) => string | undefined,
): ConfiguracionLectura {
  const num = (clave: string, porDefecto: number) => {
    const n = Number(leer(clave));
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };
  const d = CONFIG_LECTURA_POR_DEFECTO;
  return {
    umbralCaracteresTexto: num('IA_DOCS_UMBRAL_TEXTO', d.umbralCaracteresTexto),
    maxPaginas: num('IA_DOCS_MAX_PAGINAS', d.maxPaginas),
    anchoPx: num('IA_DOCS_ANCHO_PX', d.anchoPx),
    maxCaracteresTexto: num(
      'IA_DOCS_MAX_CARACTERES_TEXTO',
      d.maxCaracteresTexto,
    ),
  };
}

/** Lo mínimo que se usa de PDFParse (inyectable para pruebas). */
export interface LectorPdf {
  getInfo(): Promise<{ total: number }>;
  getText(params: { first: number }): Promise<{ text?: string }>;
  getScreenshot(params: {
    first: number;
    desiredWidth: number;
    imageDataUrl: boolean;
    imageBuffer: boolean;
  }): Promise<{ pages: Array<{ dataUrl?: string }> }>;
  destroy(): Promise<void>;
}

const crearLectorPdf = (buffer: Buffer): LectorPdf =>
  new PDFParse({ data: buffer });

export type ModoLectura =
  | 'imagen'
  | 'pdf-texto' // texto + imagen de la primera página
  | 'pdf-visual' // imágenes de las páginas
  | 'pdf-crudo'; // no se pudo renderizar: enviar el PDF completo

export interface DocumentoLeido {
  modo: ModoLectura;
  /** Texto extraído (vacío si es imagen o escaneado). */
  texto: string;
  /** Imágenes como data URL (image/png o el mime original). */
  imagenes: string[];
  paginasTotales: number;
  paginasLeidas: number;
  /** Aviso no fatal (p. ej. el render falló y se usará el PDF crudo). */
  aviso?: string;
}

export async function leerDocumento(
  buffer: Buffer,
  mimeType: string,
  cfg: ConfiguracionLectura = CONFIG_LECTURA_POR_DEFECTO,
  crearLector: (buffer: Buffer) => LectorPdf = crearLectorPdf,
): Promise<DocumentoLeido> {
  if (mimeType !== 'application/pdf') {
    return {
      modo: 'imagen',
      texto: '',
      imagenes: [`data:${mimeType};base64,${buffer.toString('base64')}`],
      paginasTotales: 1,
      paginasLeidas: 1,
    };
  }

  const parser = crearLector(buffer);
  try {
    const info = await parser.getInfo();
    const paginasTotales = info.total;
    const paginasLeidas = Math.min(paginasTotales, cfg.maxPaginas);

    const { text } = await parser.getText({ first: paginasLeidas });
    // Sin los separadores "-- 1 of 3 --" que agrega pdf-parse.
    const texto = (text ?? '').replace(/^\s*-- \d+ of \d+ --\s*$/gm, '').trim();
    const escaneado = texto.length < cfg.umbralCaracteresTexto;

    try {
      const { pages } = await parser.getScreenshot({
        first: escaneado ? paginasLeidas : 1,
        desiredWidth: cfg.anchoPx,
        imageDataUrl: true,
        imageBuffer: false,
      });
      const imagenes = pages
        .map((p) => p.dataUrl)
        .filter((u): u is string => Boolean(u));
      if (imagenes.length === 0)
        throw new Error('El render no produjo imágenes');

      return {
        modo: escaneado ? 'pdf-visual' : 'pdf-texto',
        texto: escaneado ? '' : texto.slice(0, cfg.maxCaracteresTexto),
        imagenes,
        paginasTotales,
        paginasLeidas: escaneado ? imagenes.length : paginasLeidas,
      };
    } catch (err) {
      const aviso = `No se pudo renderizar el PDF: ${(err as Error).message}`;
      return escaneado
        ? {
            modo: 'pdf-crudo',
            texto: '',
            imagenes: [],
            paginasTotales,
            paginasLeidas,
            aviso,
          }
        : {
            // Con texto suficiente se puede seguir solo con texto.
            modo: 'pdf-texto',
            texto: texto.slice(0, cfg.maxCaracteresTexto),
            imagenes: [],
            paginasTotales,
            paginasLeidas,
            aviso,
          };
    }
  } finally {
    await parser.destroy();
  }
}

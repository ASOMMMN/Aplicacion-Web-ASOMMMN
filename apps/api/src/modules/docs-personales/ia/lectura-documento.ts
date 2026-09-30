/**
 * Lectura de un documento para enviarlo al modelo de visión.
 *
 * - Imagen (JPG/PNG): se decodifica (aplicando la orientación EXIF) y se
 *   prepara (recorte, rotación, partes): ver preparar-imagen.ts.
 * - PDF: se extrae el texto de las primeras páginas y se renderizan TODAS
 *   esas páginas (anverso y reverso), una a la vez, y se preparan igual.
 *   Con poco texto (escaneado) el modelo solo ve imágenes; con texto ve
 *   texto + imágenes, y el texto sirve para verificar las fechas.
 *
 * Si el render falla, se devuelve modo 'pdf-crudo' (escaneado) para que el
 * llamador envíe el PDF completo, o se sigue solo con texto.
 */
import { loadImage } from '@napi-rs/canvas';
import { PDFParse } from 'pdf-parse';
import {
  ImagenPreparada,
  OPCIONES_PREPARACION_POR_DEFECTO,
  prepararPagina,
} from './preparar-imagen';

export interface ConfiguracionLectura {
  /** Menos caracteres que esto (en las páginas leídas) = PDF escaneado. */
  umbralCaracteresTexto: number;
  /** Máximo de páginas que se leen y renderizan. */
  maxPaginas: number;
  /** Ancho en píxeles al renderizar cada página. */
  anchoPx: number;
  /** Máximo de caracteres de texto del PDF que se envían al modelo. */
  maxCaracteresTexto: number;
  /** Máximo de partes por página (ver preparar-imagen.ts). */
  maxPartes: number;
  /** Rotación extra en grados horarios (la sugiere un intento anterior). */
  rotacionExtra?: 0 | 90 | 180 | 270;
}

export const CONFIG_LECTURA_POR_DEFECTO: ConfiguracionLectura = {
  umbralCaracteresTexto: 200,
  maxPaginas: 4,
  anchoPx: 2400,
  maxCaracteresTexto: 12000,
  maxPartes: OPCIONES_PREPARACION_POR_DEFECTO.maxPartes,
};

/**
 * Lee la configuración de variables de entorno (opcionales):
 * IA_DOCS_UMBRAL_TEXTO, IA_DOCS_MAX_PAGINAS, IA_DOCS_ANCHO_PX,
 * IA_DOCS_MAX_CARACTERES_TEXTO, IA_DOCS_MAX_PARTES.
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
    maxPartes: num('IA_DOCS_MAX_PARTES', d.maxPartes),
  };
}

/** Lo mínimo que se usa de PDFParse (inyectable para pruebas). */
export interface LectorPdf {
  getInfo(): Promise<{ total: number }>;
  getText(params: { first: number }): Promise<{ text?: string }>;
  getScreenshot(params: {
    partial: number[];
    desiredWidth: number;
    imageDataUrl: boolean;
    imageBuffer: boolean;
  }): Promise<{ pages: Array<{ data?: Uint8Array }> }>;
  destroy(): Promise<void>;
}

const crearLectorPdf = (buffer: Buffer): LectorPdf =>
  new PDFParse({ data: buffer });

export type ModoLectura =
  | 'imagen'
  | 'pdf-texto' // texto + imágenes de las páginas
  | 'pdf-visual' // imágenes de las páginas
  | 'pdf-crudo'; // no se pudo renderizar: enviar el PDF completo

export interface DocumentoLeido {
  modo: ModoLectura;
  /** Texto extraído (vacío si es imagen o escaneado). */
  texto: string;
  /** Imágenes preparadas (vista general y partes de cada página). */
  imagenes: ImagenPreparada[];
  paginasTotales: number;
  paginasLeidas: number;
  /** Aviso no fatal (p. ej. el render falló y se usará el PDF crudo). */
  aviso?: string;
}

const opcionesPreparacion = (cfg: ConfiguracionLectura) => ({
  ...OPCIONES_PREPARACION_POR_DEFECTO,
  maxPartes: cfg.maxPartes,
  rotacionExtra: cfg.rotacionExtra,
});

export async function leerDocumento(
  buffer: Buffer,
  mimeType: string,
  cfg: ConfiguracionLectura = CONFIG_LECTURA_POR_DEFECTO,
  crearLector: (buffer: Buffer) => LectorPdf = crearLectorPdf,
): Promise<DocumentoLeido> {
  if (mimeType !== 'application/pdf') {
    // loadImage aplica la orientación EXIF de las fotos de celular.
    const img = await loadImage(buffer);
    return {
      modo: 'imagen',
      texto: '',
      imagenes: prepararPagina(img, 1, opcionesPreparacion(cfg)),
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
    const textoEnviado = escaneado
      ? ''
      : texto.slice(0, cfg.maxCaracteresTexto);

    try {
      const imagenes: ImagenPreparada[] = [];
      // Una página a la vez: en Render Free (512 MB) no caben varias
      // páginas renderizadas a la vez.
      for (let p = 1; p <= paginasLeidas; p++) {
        const { pages } = await parser.getScreenshot({
          partial: [p],
          desiredWidth: cfg.anchoPx,
          imageDataUrl: false,
          imageBuffer: true,
        });
        const data = pages[0]?.data;
        if (!data)
          throw new Error(`El render de la página ${p} no produjo imagen`);
        const img = await loadImage(Buffer.from(data));
        // Con capa de texto, las fechas salen del texto: basta una imagen
        // por página (recortada) para ver qué etiqueta acompaña a cada una.
        // Escaneado: partes ampliadas para que se lean los dígitos.
        imagenes.push(
          ...prepararPagina(img, p, {
            ...opcionesPreparacion(cfg),
            ...(escaneado ? {} : { maxPartes: 1 }),
          }),
        );
      }
      return {
        modo: escaneado ? 'pdf-visual' : 'pdf-texto',
        texto: textoEnviado,
        imagenes,
        paginasTotales,
        paginasLeidas,
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
            texto: textoEnviado,
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

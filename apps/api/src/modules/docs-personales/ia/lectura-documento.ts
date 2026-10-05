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
  AJUSTES_VARIANTE,
  ImagenPreparada,
  OPCIONES_PREPARACION_POR_DEFECTO,
  prepararPagina,
  VariantePreparacion,
} from './preparar-imagen';
import {
  FuenteEstructurada,
  fuentesEstructuradas,
  leerQrs,
  MAX_PAGINAS_QR_POR_DEFECTO,
} from './qr-cadena';

export interface ConfiguracionLectura {
  /**
   * Menos caracteres que esto EN UNA PÁGINA = página escaneada: recibe el
   * tratamiento visual completo aunque otras páginas del PDF tengan texto.
   */
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
  /** Páginas en las que se buscan QR (0 = no buscar). */
  maxPaginasQr: number;
  /** Preparación de las imágenes (lecturas 2 y 3 usan otra). */
  variante?: VariantePreparacion;
}

export const CONFIG_LECTURA_POR_DEFECTO: ConfiguracionLectura = {
  umbralCaracteresTexto: 200,
  maxPaginas: 8,
  anchoPx: 2400,
  maxCaracteresTexto: 12000,
  maxPartes: OPCIONES_PREPARACION_POR_DEFECTO.maxPartes,
  maxPaginasQr: MAX_PAGINAS_QR_POR_DEFECTO,
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
    // 0 desactiva la búsqueda de QR.
    maxPaginasQr:
      leer('IA_DOCS_QR_MAX_PAGINAS') === '0'
        ? 0
        : num('IA_DOCS_QR_MAX_PAGINAS', d.maxPaginasQr),
  };
}

/** Lo mínimo que se usa de PDFParse (inyectable para pruebas). */
export interface LectorPdf {
  getInfo(): Promise<{ total: number }>;
  getText(params: { first: number }): Promise<{
    text?: string;
    pages?: Array<{ num: number; text: string }>;
  }>;
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
  /** Por página: texto de la capa del PDF, QR y cadena original. */
  paginas: PaginaLeida[];
}

export interface PaginaLeida {
  numero: number;
  /** Capa de texto de la página ('' si es escaneada o imagen). */
  texto: string;
  /** Poco o nada de texto: se envía como imagen con partes ampliadas. */
  escaneada?: boolean;
  /** QR y cadena original con sus fechas (fuente de mayor prioridad). */
  estructuradas: FuenteEstructurada[];
}

/** Texto por página: pdf-parse lo da en `pages`; si no, por separadores. */
function textosPorPagina(
  r: { text?: string; pages?: Array<{ num: number; text: string }> },
  paginas: number,
): string[] {
  if (r.pages?.length) {
    return Array.from(
      { length: paginas },
      (_, i) => r.pages!.find((p) => p.num === i + 1)?.text ?? '',
    );
  }
  const partes = (r.text ?? '').split(/^\s*-- \d+ of \d+ --\s*$/m);
  return Array.from({ length: paginas }, (_, i) => (partes[i] ?? '').trim());
}

/** QR de la imagen (nunca hace fallar la lectura). */
function qrsSeguros(img: Parameters<typeof leerQrs>[0]): string[] {
  try {
    return leerQrs(img);
  } catch {
    return [];
  }
}

const opcionesPreparacion = (cfg: ConfiguracionLectura) => {
  const v = AJUSTES_VARIANTE[cfg.variante ?? 'normal'];
  return {
    ...OPCIONES_PREPARACION_POR_DEFECTO,
    maxPartes: Math.round(cfg.maxPartes * v.factorPartes),
    rotacionExtra: cfg.rotacionExtra,
    factorBanda: v.factorBanda,
    vistaGeneralAlta: v.vistaGeneralAlta,
  };
};

export async function leerDocumento(
  buffer: Buffer,
  mimeType: string,
  cfg: ConfiguracionLectura = CONFIG_LECTURA_POR_DEFECTO,
  crearLector: (buffer: Buffer) => LectorPdf = crearLectorPdf,
): Promise<DocumentoLeido> {
  if (mimeType !== 'application/pdf') {
    // loadImage aplica la orientación EXIF de las fotos de celular.
    const img = await loadImage(buffer);
    const qrs = cfg.maxPaginasQr > 0 ? qrsSeguros(img) : [];
    return {
      modo: 'imagen',
      texto: '',
      imagenes: prepararPagina(img, 1, opcionesPreparacion(cfg)),
      paginasTotales: 1,
      paginasLeidas: 1,
      paginas: [
        {
          numero: 1,
          texto: '',
          estructuradas: fuentesEstructuradas(1, qrs, ''),
        },
      ],
    };
  }

  const parser = crearLector(buffer);
  try {
    const info = await parser.getInfo();
    const paginasTotales = info.total;
    const paginasLeidas = Math.min(paginasTotales, cfg.maxPaginas);

    const resultadoTexto = await parser.getText({ first: paginasLeidas });
    const textos = textosPorPagina(resultadoTexto, paginasLeidas);
    // Clasificación POR PÁGINA: en un PDF mixto (anverso con texto y
    // reverso escaneado) la página escaneada recibe partes ampliadas.
    const paginas: PaginaLeida[] = textos.map((t, i) => ({
      numero: i + 1,
      texto: t,
      escaneada: t.trim().length < cfg.umbralCaracteresTexto,
      estructuradas: fuentesEstructuradas(i + 1, [], t),
    }));
    const escaneado = paginas.every((p) => p.escaneada);
    // Solo el texto de las páginas con texto, sin los separadores de pdf-parse.
    const textoEnviado = escaneado
      ? ''
      : paginas
          .filter((p) => !p.escaneada)
          .map((p) => p.texto.replace(/^\s*-- \d+ of \d+ --\s*$/gm, '').trim())
          .join('\n\n')
          .slice(0, cfg.maxCaracteresTexto);

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
        const qrs = p <= cfg.maxPaginasQr ? qrsSeguros(img) : [];
        if (qrs.length) {
          paginas[p - 1].estructuradas = fuentesEstructuradas(
            p,
            qrs,
            textos[p - 1],
          );
        }
        // Página con capa de texto: las fechas salen del texto; basta una
        // imagen (recortada) para ver qué etiqueta acompaña a cada una.
        // Página escaneada: partes ampliadas para que se lean los dígitos.
        imagenes.push(
          ...prepararPagina(img, p, {
            ...opcionesPreparacion(cfg),
            ...(paginas[p - 1].escaneada ? {} : { maxPartes: 1 }),
          }),
        );
      }
      return {
        modo: escaneado ? 'pdf-visual' : 'pdf-texto',
        texto: textoEnviado,
        imagenes,
        paginasTotales,
        paginasLeidas,
        paginas,
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
            paginas,
            aviso,
          }
        : {
            // Con texto suficiente se puede seguir solo con texto.
            modo: 'pdf-texto',
            texto: textoEnviado,
            imagenes: [],
            paginasTotales,
            paginasLeidas,
            paginas,
            aviso,
          };
    }
  } finally {
    await parser.destroy();
  }
}

/**
 * QR y "Cadena Original" de documentos SEMAR/DGMM (certificado médico,
 * libreta de mar, títulos, refrendos): traen las fechas en texto
 * estructurado ("DICTAMEN:19/12/2025|VIGENCIA:19/12/2027"). Es la fuente
 * más confiable: tiene prioridad sobre el extractor por etiquetas, el OCR y
 * la IA, y basta sola para una fecha "Coincidente".
 *
 * - QR: jsqr (JavaScript puro, sin paquetes del sistema) sobre la página
 *   renderizada. Busca varios códigos por página tapando cada uno ya leído.
 * - Cadena original: se busca en la capa de texto del PDF y en el QR.
 */
import { Canvas, createCanvas, Image } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { extraerPorEtiquetas, LecturaFecha } from './extractor-etiquetas';

const MAX_QR_POR_PAGINA = 2;
/**
 * Anchos a los que se busca el QR, en orden (se detiene al encontrar uno).
 * Medido con documentos reales: jsQR detecta a 800 y 1600 px pero no
 * siempre a 1000-1200; cada intento cuesta ~0.3-1 s de CPU por página.
 */
const ANCHOS_QR = [800, 1600];
/** Páginas en las que se buscan QR (los de SEMAR/DGMM van al frente). */
export const MAX_PAGINAS_QR_POR_DEFECTO = 2;

/** Decodifica los QR de una página (a varias escalas). */
export function leerQrs(fuente: Image | Canvas): string[] {
  const encontrados = new Set<string>();
  for (const anchoObjetivo of ANCHOS_QR) {
    const esc = Math.min(1, anchoObjetivo / fuente.width);
    const w = Math.max(1, Math.round(fuente.width * esc));
    const h = Math.max(1, Math.round(fuente.height * esc));
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fuente, 0, 0, w, h);
    for (let i = 0; i < MAX_QR_POR_PAGINA; i++) {
      const img = ctx.getImageData(0, 0, w, h);
      const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (!qr?.data) break;
      encontrados.add(qr.data.trim());
      // Tapa el código leído para buscar otro en la misma página.
      const xs = [qr.location.topLeftCorner.x, qr.location.topRightCorner.x, qr.location.bottomLeftCorner.x, qr.location.bottomRightCorner.x]; // prettier-ignore
      const ys = [qr.location.topLeftCorner.y, qr.location.topRightCorner.y, qr.location.bottomLeftCorner.y, qr.location.bottomRightCorner.y]; // prettier-ignore
      ctx.fillStyle = '#fff';
      ctx.fillRect(
        Math.min(...xs) - 8,
        Math.min(...ys) - 8,
        Math.max(...xs) - Math.min(...xs) + 16,
        Math.max(...ys) - Math.min(...ys) + 16,
      );
    }
    if (encontrados.size > 0) break;
  }
  return [...encontrados];
}

/** Claves de la cadena original → etiqueta que entiende el extractor. */
const CLAVES: Array<[RegExp, string]> = [
  [/^(?:f(?:echa)?[_ ]?)?(?:expedicion|emision|exp|emi)$/, 'Fecha de expedición'],
  [/^(?:f(?:echa)?[_ ]?)?(?:vencimiento|vence|venc|expiracion|caducidad)$/, 'Fecha de vencimiento'],
  [/^(?:f(?:echa)?[_ ]?)?inicio$/, 'Válido desde'],
  [/^vigencia$/, 'Vigencia'],
  [/^dictamen$/, 'Dictamen'],
]; // prettier-ignore

/**
 * Convierte "CLAVE:VALOR|CLAVE:VALOR" en líneas "Etiqueta: valor" y las
 * pasa por el extractor determinista (fuente "qr").
 */
export function leerCadena(
  cadena: string,
  pagina: number,
  formatoIndicado?: string | null,
): LecturaFecha[] {
  const lineas = cadena
    .split(/\|+/)
    .map((par) => {
      const m = /^\s*([^:=]{1,40})\s*[:=]\s*(.+?)\s*$/.exec(par);
      if (!m) return '';
      const clave = m[1]
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
      const etiqueta = CLAVES.find(([re]) => re.test(clave))?.[1];
      return etiqueta ? `${etiqueta}: ${m[2]}` : '';
    })
    .filter(Boolean);
  if (lineas.length === 0) return [];
  return extraerPorEtiquetas(lineas.join('\n'), {
    pagina,
    fuente: 'qr',
    formatoIndicado,
  });
}

/** La "Cadena Original" que aparece en la capa de texto del PDF. */
export function buscarCadenaOriginal(texto: string): string | null {
  const m =
    /cadena\s+original[^|\n]*[:\n]\s*([^\n]*\|[^\n]*(?:\n[^\n]*\|[^\n]*)*)/i.exec(
      texto,
    );
  return m ? m[1].replace(/\s*\n\s*/g, '') : null;
}

export interface FuenteEstructurada {
  pagina: number;
  origen: 'qr' | 'cadena_original';
  /** Texto tal cual (evidencia). */
  texto: string;
  lecturas: LecturaFecha[];
}

/** QR y cadena original de una página, con sus lecturas de fecha. */
export function fuentesEstructuradas(
  pagina: number,
  qrs: string[],
  textoPagina: string,
): FuenteEstructurada[] {
  const fuentes: FuenteEstructurada[] = qrs.map((texto) => ({
    pagina,
    origen: 'qr' as const,
    texto,
    lecturas: leerCadena(texto, pagina),
  }));
  const cadena = buscarCadenaOriginal(textoPagina);
  if (cadena) {
    fuentes.push({
      pagina,
      origen: 'cadena_original',
      texto: cadena,
      lecturas: leerCadena(cadena, pagina),
    });
  }
  return fuentes;
}

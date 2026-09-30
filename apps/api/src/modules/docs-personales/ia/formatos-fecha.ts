/**
 * Lectura de fechas desde el texto literal de un documento.
 *
 * La precisión (día, mes o año) se determina SIEMPRE a partir del texto,
 * nunca de lo que diga el modelo: "EMISIÓN 2016" es precisión año aunque el
 * modelo devuelva 2016-01-01.
 *
 * Formatos: 09-05-2024, 09/05/2024, 09.05.2024, 09 05 2024, 2024-05-09,
 * 11 de abril de 2025, 11 abril 2025, 09 MAY 2024, 09MAY2024,
 * 19 DEC/DIC 2025, MAY 09 2024, Apr 11th 2025, April 11, 2025,
 * abril de 2025 / 04/2025 (mes), 2016 (año). Numéricas: dd/mm salvo que el
 * documento declare mm/dd.
 */

export type PrecisionFecha = 'dia' | 'mes' | 'anio';

export interface FechaLeida {
  precision: PrecisionFecha;
  anio: number;
  mes?: number;
  dia?: number;
  /** AAAA-MM-DD si precision = 'dia'. */
  iso: string | null;
  /** Numéricas: la lectura con día y mes invertidos (si es válida). */
  invertida: string | null;
  /** Día y mes ≤ 12 sin formato declarado. */
  ambigua: boolean;
  /** Años sueltos que aparecen ("VIGENCIA 2021 - 2031" → [2021, 2031]). */
  anios: number[];
}

const MESES: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
}; // prettier-ignore

const NOMBRE_MES = Object.keys(MESES)
  .sort((a, b) => b.length - a.length)
  .join('|');

export function isoValida(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (
    f.getUTCFullYear() !== y ||
    f.getUTCMonth() !== m - 1 ||
    f.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const anioCompleto = (a: number) =>
  a >= 100 ? a : a <= 69 ? 2000 + a : 1900 + a;

/** Minúsculas, sin acentos, sin ordinales (11th, 1°, 1er → 11, 1, 1). */
export function normalizarTexto(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th|er|ro)\b/g, '$1')
    .replace(/(\d)\s*[°º]/g, '$1');
}

const aniosDe = (t: string) =>
  [...t.matchAll(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g)].map((m) => Number(m[1]));

/**
 * Lee la primera fecha del texto literal. null si no hay ninguna fecha
 * (ni siquiera un año).
 */
export function leerFechaLiteral(
  literal: string | null | undefined,
  formatoIndicado?: string | null,
): FechaLeida | null {
  if (!literal) return null;
  const t = normalizarTexto(literal);
  const anios = aniosDe(t);
  const mmdd = /^\s*m/.test(normalizarTexto(formatoIndicado ?? ''));

  // AAAA-MM-DD
  let m = /(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/.exec(
    t,
  );
  if (m) {
    const iso = isoValida(+m[1], +m[2], +m[3]);
    // Tiene forma de fecha completa pero no es válida (p. ej. OCR "2021-00-10"):
    // se rechaza; nunca se degrada a mes o año.
    if (!iso) return null;
    return { precision: 'dia', anio: +m[1], mes: +m[2], dia: +m[3], iso, invertida: null, ambigua: false, anios }; // prettier-ignore
  }

  // dd sep mm sep aaaa (o aa)
  m =
    /(?<!\d)(\d{1,2})\s*[-/.\s]\s*(\d{1,2})\s*[-/.\s]\s*(\d{4}|\d{2})(?!\d)/.exec(
      t,
    );
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = anioCompleto(+m[3]);
    const [d, mes] = mmdd ? [b, a] : [a, b];
    const iso = isoValida(y, mes, d);
    if (!iso) return null; // "10-00-2021": ilegible, no "año 2021"
    return {
      precision: 'dia',
      anio: y,
      mes,
      dia: d,
      iso,
      invertida: isoValida(y, d, mes),
      ambigua: a <= 12 && b <= 12 && a !== b && !formatoIndicado,
      anios,
    };
  }

  // dd [de] MES [de|,] aaaa  → "11 de abril de 2025", "09MAY2024", "19 dec/dic 2025"
  m = new RegExp(
    `(?<!\\d)(\\d{1,2})\\s*(?:de\\s+|[-/.]\\s*)?(${NOMBRE_MES})\\.?(?:\\s*/\\s*(?:${NOMBRE_MES})\\.?)?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?(\\d{4})(?!\\d)`,
  ).exec(t);
  if (m) {
    const iso = isoValida(+m[3], MESES[m[2]], +m[1]);
    if (iso)
      return { precision: 'dia', anio: +m[3], mes: MESES[m[2]], dia: +m[1], iso, invertida: null, ambigua: false, anios }; // prettier-ignore
  }

  // MES dd[,] aaaa → "may 09 2024", "apr 11 2025", "april 11, 2025"
  m = new RegExp(
    `\\b(${NOMBRE_MES})\\.?\\s*(\\d{1,2})\\s*,?\\s*(\\d{4})(?!\\d)`,
  ).exec(t);
  if (m) {
    const iso = isoValida(+m[3], MESES[m[1]], +m[2]);
    if (iso)
      return { precision: 'dia', anio: +m[3], mes: MESES[m[1]], dia: +m[2], iso, invertida: null, ambigua: false, anios }; // prettier-ignore
  }

  // Mes y año: "abril de 2025", "apr 2025", "04/2025"
  m = new RegExp(
    `\\b(${NOMBRE_MES})\\.?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?(\\d{4})(?!\\d)`,
  ).exec(t);
  if (m) {
    return { precision: 'mes', anio: +m[2], mes: MESES[m[1]], iso: null, invertida: null, ambigua: false, anios }; // prettier-ignore
  }
  m = /(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{4})(?![\d/.-])/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    return { precision: 'mes', anio: +m[2], mes: +m[1], iso: null, invertida: null, ambigua: false, anios }; // prettier-ignore
  }

  // Solo año
  if (anios.length > 0) {
    return { precision: 'anio', anio: anios[anios.length - 1], iso: null, invertida: null, ambigua: false, anios }; // prettier-ignore
  }
  return null;
}

/**
 * Valor que se guarda para una fecha leída. Día: la fecha exacta. Parcial:
 * inicio del periodo (emisión/inicio) o fin (vencimiento), siempre junto
 * con su precisión para mostrarla como "2016" o "04/2025".
 */
export function valorGuardado(
  f: FechaLeida,
  campo: 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
): string {
  if (f.precision === 'dia' && f.iso) return f.iso;
  const fin = campo === 'fechaVencimiento';
  if (f.precision === 'mes' && f.mes) {
    const dia = fin ? new Date(Date.UTC(f.anio, f.mes, 0)).getUTCDate() : 1;
    return `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return fin ? `${f.anio}-12-31` : `${f.anio}-01-01`;
}

/** "09/05/2024", "04/2025" o "2016" según la precisión. */
export function formatearConPrecision(
  iso: string | null,
  precision: PrecisionFecha = 'dia',
): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  if (precision === 'anio') return m[1];
  if (precision === 'mes') return `${m[2]}/${m[1]}`;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Forma canónica de una fecha para comparar lecturas (texto, OCR, IA):
 * "2024-05-09", "2025-04" o "2016".
 */
export function claveFecha(f: FechaLeida): string {
  if (f.precision === 'dia' && f.iso) return f.iso;
  if (f.precision === 'mes' && f.mes)
    return `${f.anio}-${String(f.mes).padStart(2, '0')}`;
  return String(f.anio);
}

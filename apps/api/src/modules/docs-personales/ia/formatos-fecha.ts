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
  /** Numérica con día y mes ≤ 12 (se calcula siempre, haya o no formato). */
  ambigua: boolean;
  /** Años de esta fecha ("2021 - 2031" → [2021, 2031]). */
  anios: number[];
  /** Posición en el texto normalizado (normalizarTexto) del literal. */
  ini: number;
  fin: number;
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

/** ¿El formato indicado es mes/día? ("mm/dd/aaaa", "MM DD YYYY"…). */
const esMesDia = (formato?: string | null) =>
  /^\s*m/.test(normalizarTexto(formato ?? ''));

/**
 * Una coincidencia en el texto normalizado. `fecha` null = tiene forma de
 * fecha completa pero no es válida ("2021-00-10", "31/02/2024"): bloquea el
 * tramo para que nunca se degrade a mes o año.
 */
interface Coincidencia {
  ini: number;
  fin: number;
  prioridad: number;
  fecha: FechaLeida | null;
}

type Lector = (
  m: RegExpExecArray,
  mmdd: boolean,
) => FechaLeida | null | undefined;

const base = (m: RegExpExecArray) => ({
  ini: m.index,
  fin: m.index + m[0].length,
});

/**
 * Patrones en orden de prioridad (ante solapes gana el de menor índice).
 * El lector devuelve undefined si la coincidencia no es una fecha (se
 * ignora) y null si es una fecha completa ilegible (bloquea el tramo).
 */
const PATRONES: Array<{ re: RegExp; leer: Lector }> = [
  // AAAA-MM-DD
  {
    re: /(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g,
    leer: (m) => {
      const iso = isoValida(+m[1], +m[2], +m[3]);
      if (!iso) return null;
      return { precision: 'dia', anio: +m[1], mes: +m[2], dia: +m[3], iso, invertida: null, ambigua: false, anios: [+m[1]], ...base(m) }; // prettier-ignore
    },
  },
  // dd sep mm sep aaaa (o aa)
  {
    re: /(?<!\d)(\d{1,2})\s*[-/.\s]\s*(\d{1,2})\s*[-/.\s]\s*(\d{4}|\d{2})(?!\d)/g,
    leer: (m, mmdd) => {
      const a = +m[1];
      const b = +m[2];
      const y = anioCompleto(+m[3]);
      const [d, mes] = mmdd ? [b, a] : [a, b];
      const iso = isoValida(y, mes, d);
      if (!iso) return null;
      return {
        precision: 'dia',
        anio: y,
        mes,
        dia: d,
        iso,
        invertida: isoValida(y, d, mes),
        // Siempre, aunque se declare un formato: decidir si el formato
        // declarado es confiable le corresponde a quien llama.
        ambigua: a <= 12 && b <= 12 && a !== b,
        anios: [y],
        ...base(m),
      };
    },
  },
  // dd [de] MES [de|,] aaaa → "11 de abril de 2025", "09MAY2024", "19 dec/dic 2025"
  {
    re: new RegExp(
      `(?<!\\d)(\\d{1,2})\\s*(?:de\\s+|[-/.]\\s*)?(${NOMBRE_MES})\\.?(?:\\s*/\\s*(?:${NOMBRE_MES})\\.?)?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?(\\d{4})(?!\\d)`,
      'g',
    ),
    leer: (m) => {
      const iso = isoValida(+m[3], MESES[m[2]], +m[1]);
      return iso
        ? { precision: 'dia', anio: +m[3], mes: MESES[m[2]], dia: +m[1], iso, invertida: null, ambigua: false, anios: [+m[3]], ...base(m) } // prettier-ignore
        : undefined;
    },
  },
  // dd MES aa → "19 DEC 27", "09FEB22" (año de 2 dígitos con mes en letra)
  {
    re: new RegExp(
      `(?<!\\d)(\\d{1,2})\\s*(?:[-/.]\\s*)?(${NOMBRE_MES})\\.?(?:\\s*/\\s*(?:${NOMBRE_MES})\\.?)?\\s*(?:[-/.,]\\s*)?(\\d{2})(?!\\d)`,
      'g',
    ),
    leer: (m) => {
      const y = anioCompleto(+m[3]);
      const iso = isoValida(y, MESES[m[2]], +m[1]);
      return iso
        ? { precision: 'dia', anio: y, mes: MESES[m[2]], dia: +m[1], iso, invertida: null, ambigua: false, anios: [y], ...base(m) } // prettier-ignore
        : undefined;
    },
  },
  // MES dd[,] aaaa → "may 09 2024", "apr 11 2025", "april 11, 2025"
  {
    re: new RegExp(
      `\\b(${NOMBRE_MES})\\.?\\s*(\\d{1,2})\\s*,?\\s*(\\d{4})(?!\\d)`,
      'g',
    ),
    leer: (m) => {
      const iso = isoValida(+m[3], MESES[m[1]], +m[2]);
      return iso
        ? { precision: 'dia', anio: +m[3], mes: MESES[m[1]], dia: +m[2], iso, invertida: null, ambigua: false, anios: [+m[3]], ...base(m) } // prettier-ignore
        : undefined;
    },
  },
  // Mes y año: "abril de 2025", "apr 2025"
  {
    re: new RegExp(
      `\\b(${NOMBRE_MES})\\.?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?(\\d{4})(?!\\d)`,
      'g',
    ),
    leer: (m) => ({ precision: 'mes', anio: +m[2], mes: MESES[m[1]], iso: null, invertida: null, ambigua: false, anios: [+m[2]], ...base(m) }), // prettier-ignore
  },
  // Mes y año numérico: "04/2025"
  {
    re: /(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{4})(?![\d/.-])/g,
    leer: (m) =>
      +m[1] >= 1 && +m[1] <= 12
        ? { precision: 'mes', anio: +m[2], mes: +m[1], iso: null, invertida: null, ambigua: false, anios: [+m[2]], ...base(m) } // prettier-ignore
        : undefined,
  },
  // Rango de años: "VIGENCIA 2021 - 2031" → una sola lectura (el último año)
  {
    re: /(?<!\d)(19\d{2}|20\d{2})\s*[-–]\s*(19\d{2}|20\d{2})(?!\d)/g,
    leer: (m) => ({ precision: 'anio', anio: +m[2], iso: null, invertida: null, ambigua: false, anios: [+m[1], +m[2]], ...base(m) }), // prettier-ignore
  },
  // Solo año
  {
    re: /(?<!\d)(19\d{2}|20\d{2})(?!\d)/g,
    leer: (m) => ({ precision: 'anio', anio: +m[1], iso: null, invertida: null, ambigua: false, anios: [+m[1]], ...base(m) }), // prettier-ignore
  },
];

/** Todas las coincidencias sin solapes, en orden de aparición. */
function coincidencias(t: string, mmdd: boolean): Coincidencia[] {
  const todas: Coincidencia[] = [];
  PATRONES.forEach(({ re, leer }, prioridad) => {
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      const fecha = leer(m, mmdd);
      if (fecha === undefined) continue;
      todas.push({ ...base(m), prioridad, fecha });
    }
  });
  todas.sort(
    (a, b) => a.prioridad - b.prioridad || b.fin - b.ini - (a.fin - a.ini),
  );
  const aceptadas: Coincidencia[] = [];
  for (const c of todas) {
    if (aceptadas.some((o) => c.ini < o.fin && o.ini < c.fin)) continue;
    aceptadas.push(c);
  }
  return aceptadas.sort((a, b) => a.ini - b.ini);
}

/**
 * Todas las fechas legibles del texto literal, en orden de aparición, con su
 * posición (`ini`/`fin`) sobre `normalizarTexto(literal)`.
 */
export function leerFechasLiteral(
  literal: string | null | undefined,
  formatoIndicado?: string | null,
): FechaLeida[] {
  if (!literal) return [];
  return coincidencias(normalizarTexto(literal), esMesDia(formatoIndicado))
    .map((c) => c.fecha)
    .filter((f): f is FechaLeida => f !== null);
}

/**
 * Una sola fecha del literal: la primera con día (o null si es ilegible);
 * si no hay, la primera de mes; si no, el primer año (o rango de años).
 * null si no hay ninguna fecha.
 */
export function leerFechaLiteral(
  literal: string | null | undefined,
  formatoIndicado?: string | null,
): FechaLeida | null {
  if (!literal) return null;
  const cs = coincidencias(normalizarTexto(literal), esMesDia(formatoIndicado));
  const dia = cs.find((c) => !c.fecha || c.fecha.precision === 'dia');
  if (dia) return dia.fecha;
  return (
    cs.find((c) => c.fecha?.precision === 'mes')?.fecha ??
    cs.find((c) => c.fecha?.precision === 'anio')?.fecha ??
    null
  );
}

export type FormatoNumerico = 'dd/mm/aaaa' | 'mm/dd/aaaa';

const IND_DIA = '(?:dd|dia)';
const IND_MES = '(?:mm|mes)';
const IND_ANIO = '(?:aaaa|yyyy|aa|yy|ano|anio)';
const SEP = '\\s*[-/.\\s]\\s*';
const INDICADOR_DD_MM = new RegExp(
  `\\b${IND_DIA}${SEP}${IND_MES}${SEP}${IND_ANIO}\\b`,
);
const INDICADOR_MM_DD = new RegExp(
  `\\b${IND_MES}${SEP}${IND_DIA}${SEP}${IND_ANIO}\\b`,
);

/**
 * Formato numérico que el documento declara por escrito ("dd/mm/aaaa",
 * "MM/DD/YYYY", "DD MM YYYY"…). null si no hay indicador o si hay ambos.
 * Es la única forma de aceptar mm/dd: lo que diga el modelo no basta.
 */
export function detectarIndicadorFormato(
  ...textos: Array<string | null | undefined>
): FormatoNumerico | null {
  const t = normalizarTexto(textos.filter(Boolean).join('\n'));
  const ddmm = INDICADOR_DD_MM.test(t);
  const mmdd = INDICADOR_MM_DD.test(t);
  if (ddmm === mmdd) return null;
  return ddmm ? 'dd/mm/aaaa' : 'mm/dd/aaaa';
}

/** Patrón numérico crudo dd/mm/aaaa (o mm/dd), sin asumir cuál es cuál. */
const NUMERICA_CRUDA =
  /(?<!\d)(\d{1,2})\s*[-/.\s]\s*(\d{1,2})\s*[-/.\s]\s*(\d{4}|\d{2})(?!\d)/g;

/**
 * Evidencia del formato numérico en OTRAS fechas del mismo documento: si el
 * primer componente de alguna fecha es > 12, solo puede ser el día (dd/mm);
 * si es el segundo el que es > 12, solo puede ser el día en mm/dd. A
 * diferencia de `detectarIndicadorFormato` (busca "dd/mm/aaaa" escrito) o del
 * país emisor (poco confiable: el modelo puede no detectarlo), esto se basa
 * en los propios valores numéricos del documento, sin adivinar.
 *
 * 'conflicto' cuando el documento tiene evidencia de AMBOS formatos (p. ej.
 * varios documentos distintos mezclados en un mismo archivo): en ese caso no
 * hay que asumir ninguno, sino marcar la fecha ambigua para revisión.
 */
export function formatoPorFechasDelDocumento(
  ...textos: Array<string | null | undefined>
): FormatoNumerico | 'conflicto' | null {
  const t = normalizarTexto(textos.filter(Boolean).join('\n'));
  let ddmm = false;
  let mmdd = false;
  for (const m of t.matchAll(new RegExp(NUMERICA_CRUDA.source, 'g'))) {
    const a = +m[1];
    const b = +m[2];
    const y = anioCompleto(+m[3]);
    if (a > 12 && b <= 12 && isoValida(y, b, a)) ddmm = true;
    else if (b > 12 && a <= 12 && isoValida(y, a, b)) mmdd = true;
  }
  if (ddmm && mmdd) return 'conflicto';
  if (ddmm) return 'dd/mm/aaaa';
  if (mmdd) return 'mm/dd/aaaa';
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

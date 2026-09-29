/**
 * Deduplicación de cursos entre el CV (extracción IA) y los cursos subidos
 * por el postulante.
 *
 * Criterio: preferimos un duplicado visible a una unión incorrecta (que
 * ocultaría un curso). Por eso, además de la similitud del nombre, hay dos
 * vetos: referencias STCW distintas y palabras que distinguen niveles.
 */

import type { DiscrepanciaVencimiento, ItemBase } from './resumen-fechas.types';

/** Similitud mínima del nombre para considerarlo el mismo curso. */
export const UMBRAL_SIMILITUD_NOMBRE = 0.85;
/** Similitud mínima cuando además coincide la fecha de vencimiento. */
export const UMBRAL_SIMILITUD_CON_VENCIMIENTO = 0.6;

const PALABRAS_VACIAS = new Set([
  // artículos, preposiciones y conectores
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'en',
  'y',
  'e',
  'o',
  'u',
  'a',
  'al',
  'para',
  'por',
  'con',
  'sobre',
  'the',
  'of',
  'and',
  'for',
  'in',
  'on',
  'to',
  'with',
  // genéricas que no identifican al curso
  'curso',
  'certificado',
  'certificacion',
  'constancia',
  'diploma',
  'course',
  'certificate',
  'certification',
]);

/**
 * Raíces que distinguen cursos distintos con nombre casi igual
 * (p. ej. "Lucha contra incendios" vs "Lucha contra incendios avanzada").
 */
const RAICES_DISTINTIVAS = [
  'avanzad',
  'advanc',
  'basic',
  'superior',
  'operacion',
  'gestion',
  'manag',
  'actualiz',
  'updat',
  'refresh',
  'renov',
  'recurren',
  'instructor',
  'evaluador',
  'supervisor',
  'capitan',
  'oficial',
  'officer',
  'master',
];

/** Referencias de regla STCW: "Reg.VI/3", "A-VI/2-1", "Regla II/1" → "vi/3". */
const RE_REF_REGLA =
  /\b(?:[ab]\s*-\s*)?([ivx]+)\s*\/\s*(\d+(?:\s*-\s*\d+)?)\b/g;

/** Ruido de referencias normativas que no aporta a la identidad del curso. */
const RE_RUIDO_NORMATIVO = [
  /\bstcw(?:\s*['’]?\s*\d{2,4})?(?:\s*\/\s*\d{2,4})?\b/g, // STCW, STCW 78/95, STCW 2010
  /\b(?:model\s+course|curso\s+modelo)\b/g,
  /\b(?:omi|imo)\b(?:\s*\d+\.\d+)?/g, // OMI 1.19
  /\b(?:19|20)\d{2}\b/g, // años (enmienda 2010, "curso 2019"): no identifican al curso
  /\b(?:regla|reg|regulation|seccion|section|tabla|table|capitulo|chapter|cap|codigo|code|parte|part)\b\.?/g,
  /\b(?:enmendado|enmendada|enmiendas|amended|manila|convenio|convention)\b/g,
  /\b\d{2}\s*\/\s*\d{2,4}\b/g, // 78/95
];

export interface NombreNormalizado {
  /** Texto comparable: minúsculas, sin acentos, referencias ni puntuación. */
  clave: string;
  /** Palabras significativas (sin palabras vacías, singularizadas). */
  tokens: string[];
  /** Reglas STCW citadas, p. ej. ["vi/3"]. */
  refs: string[];
}

function quitarAcentos(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Singular aproximado para comparar: "botes" → "bote", "rapidos" → "rapido". */
function singular(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

export function normalizarNombreCurso(nombre: string): NombreNormalizado {
  let texto = quitarAcentos(nombre)
    .toLowerCase()
    .replace(/\.(pdf|jpe?g|png|docx?)$/i, '');

  const refs = new Set<string>();
  texto = texto.replace(RE_REF_REGLA, (_m, cap: string, num: string) => {
    refs.add(`${cap}/${num.replace(/\s+/g, '')}`);
    return ' ';
  });
  for (const re of RE_RUIDO_NORMATIVO) texto = texto.replace(re, ' ');

  const clave = texto
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = clave
    .split(' ')
    .filter((t) => t && !PALABRAS_VACIAS.has(t))
    .map(singular);

  return { clave, tokens, refs: [...refs].sort() };
}

/** Coeficiente de Dice sobre conjuntos de palabras (0..1). */
export function similitudNombres(
  a: NombreNormalizado,
  b: NombreNormalizado,
): number {
  const sa = new Set(a.tokens);
  const sb = new Set(b.tokens);
  if (sa.size === 0 || sb.size === 0) return 0;
  let comunes = 0;
  for (const t of sa) if (sb.has(t)) comunes++;
  return (2 * comunes) / (sa.size + sb.size);
}

function difierenEnPalabraDistintiva(
  a: NombreNormalizado,
  b: NombreNormalizado,
): boolean {
  const sa = new Set(a.tokens);
  const sb = new Set(b.tokens);
  const diferencia = [
    ...a.tokens.filter((t) => !sb.has(t)),
    ...b.tokens.filter((t) => !sa.has(t)),
  ];
  return diferencia.some(
    (t) => /^\d+$/.test(t) || RAICES_DISTINTIVAS.some((r) => t.startsWith(r)),
  );
}

export interface ResultadoComparacion {
  mismoCurso: boolean;
  similitud: number;
}

export function compararCursos(
  a: { nombre: string; fechaVencimiento: string | null },
  b: { nombre: string; fechaVencimiento: string | null },
): ResultadoComparacion {
  const na = normalizarNombreCurso(a.nombre);
  const nb = normalizarNombreCurso(b.nombre);
  const similitud = similitudNombres(na, nb);
  const no = { mismoCurso: false, similitud };

  if (na.tokens.length === 0 || nb.tokens.length === 0) return no;

  // Vetos: reglas STCW distintas, o nombres que difieren en nivel/número.
  if (
    na.refs.length > 0 &&
    nb.refs.length > 0 &&
    !na.refs.some((r) => nb.refs.includes(r))
  ) {
    return no;
  }
  if (na.clave === nb.clave) return { mismoCurso: true, similitud: 1 };
  if (difierenEnPalabraDistintiva(na, nb)) return no;

  if (similitud >= UMBRAL_SIMILITUD_NOMBRE) {
    return { mismoCurso: true, similitud };
  }
  const mismoVencimiento =
    !!a.fechaVencimiento && a.fechaVencimiento === b.fechaVencimiento;
  if (mismoVencimiento && similitud >= UMBRAL_SIMILITUD_CON_VENCIMIENTO) {
    return { mismoCurso: true, similitud };
  }
  return no;
}

/**
 * Une cursos subidos y del CV.
 *
 * - Los subidos no se unen entre sí salvo que el nombre normalizado sea
 *   idéntico (renovación del mismo certificado): se conserva el de
 *   vencimiento más reciente.
 * - Cada curso del CV se une al subido más parecido que cumpla el criterio.
 *   Los datos subidos prevalecen; el CV solo completa campos vacíos.
 * - Si ambos tienen vencimiento y no coinciden, se marca discrepancia.
 */
export function unificarCursos(
  subidos: ItemBase[],
  cv: ItemBase[],
): ItemBase[] {
  const resultado: ItemBase[] = [];
  const porClave = new Map<string, ItemBase>();

  for (const curso of subidos) {
    const clave = normalizarNombreCurso(curso.nombre).clave;
    const previo = clave ? porClave.get(clave) : undefined;
    if (previo) {
      if ((curso.fechaVencimiento ?? '') > (previo.fechaVencimiento ?? '')) {
        Object.assign(previo, { ...curso, fuente: [...curso.fuente] });
      }
      continue;
    }
    const copia = { ...curso, fuente: [...curso.fuente] };
    resultado.push(copia);
    if (clave) porClave.set(clave, copia);
  }
  const subidosUnicos = [...resultado];
  const clavesCV = new Set<string>();

  for (const curso of cv) {
    const clave = normalizarNombreCurso(curso.nombre).clave;
    if (!clave || clavesCV.has(clave)) continue; // repetido dentro del CV
    clavesCV.add(clave);

    let mejor: { item: ItemBase; similitud: number } | null = null;
    for (const subido of subidosUnicos) {
      const r = compararCursos(subido, curso);
      if (r.mismoCurso && (!mejor || r.similitud > mejor.similitud)) {
        mejor = { item: subido, similitud: r.similitud };
      }
    }

    if (!mejor) {
      resultado.push({ ...curso, fuente: [...curso.fuente] });
      continue;
    }

    const destino = mejor.item;
    const discrepancia: DiscrepanciaVencimiento | null =
      destino.fechaVencimiento &&
      curso.fechaVencimiento &&
      destino.fechaVencimiento !== curso.fechaVencimiento
        ? {
            fechaVencimientoSubido: destino.fechaVencimiento,
            fechaVencimientoCV: curso.fechaVencimiento,
          }
        : null;

    destino.institucion ??= curso.institucion;
    destino.fechaInicio ??= curso.fechaInicio;
    destino.fechaEmision ??= curso.fechaEmision;
    destino.fechaVencimiento ??= curso.fechaVencimiento;
    destino.confianzaCV = curso.confianzaCV;
    destino.nombreEnCV ??= curso.nombre;
    destino.discrepancia ??= discrepancia;
    destino.origen = 'subido_y_cv';
    destino.fuente = [...new Set([...destino.fuente, ...curso.fuente])];
  }

  return resultado;
}

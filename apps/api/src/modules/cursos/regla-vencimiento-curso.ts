/**
 * Regla de vencimiento de cursos y certificaciones (solo cursos registrados
 * con documento; los que solo aparecen en el CV no la usan).
 *
 * - El documento trae vencimiento/expiración → esa fecha exacta, nunca se
 *   recalcula ni se reemplaza. origen DOCUMENTO.
 * - No lo trae → base = fecha de inicio (o de emisión si no hay inicio) +
 *   5 años; el 29/02 + 5 años es el 28/02. origen CALCULADO_5_ANOS
 *   (se guarda también fechaVencimientoEstimada = true).
 * - Sin fecha base válida → REQUIERE_REVISION. Nunca se inventa una fecha.
 * - SIN_VENCIMIENTO solo si el curso está configurado así explícitamente
 *   (CURSOS_SIN_VENCIMIENTO).
 *
 * El vencimiento calculado se muestra SIEMPRE como "estimado (5 años)".
 */

export const ORIGENES_VENCIMIENTO = [
  'DOCUMENTO',
  'CALCULADO_5_ANOS',
  'SIN_VENCIMIENTO',
  'REQUIERE_REVISION',
] as const;

export type OrigenVencimiento = (typeof ORIGENES_VENCIMIENTO)[number];

export const ANIOS_VIGENCIA_CURSO = 5;

/**
 * Cursos que no vencen, por nombre (sin acentos, minúsculas). Vacío: hoy
 * ningún curso está configurado sin vencimiento.
 */
export const CURSOS_SIN_VENCIMIENTO: RegExp[] = [];

export interface EntradaReglaVencimiento {
  /** YYYY-MM-DD o null. */
  fechaInicio?: string | null;
  fechaEmision?: string | null;
  /** Vencimiento que trae el documento (o que capturó el postulante). */
  fechaVencimientoDocumento?: string | null;
  nombreCurso?: string | null;
}

export interface ResultadoReglaVencimiento {
  fechaVencimiento: string | null;
  origen: OrigenVencimiento;
  /** Fecha y campo de donde se calculó (solo CALCULADO_5_ANOS). */
  base: { campo: 'fechaInicio' | 'fechaEmision'; fecha: string } | null;
}

/** YYYY-MM-DD de calendario válido. */
function isoValida(v: string | null | undefined): string | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  if (!m) return null;
  const [y, mes, d] = [+m[1], +m[2], +m[3]];
  const f = new Date(Date.UTC(y, mes - 1, d));
  return f.getUTCFullYear() === y &&
    f.getUTCMonth() === mes - 1 &&
    f.getUTCDate() === d
    ? `${m[1]}-${m[2]}-${m[3]}`
    : null;
}

/** Suma años de calendario; el 29/02 cae en 28/02 si el año destino no es bisiesto. */
export function sumarAnios(iso: string, anios: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y + anios, m - 1, d));
  if (f.getUTCMonth() !== m - 1) f.setUTCDate(0);
  return f.toISOString().slice(0, 10);
}

const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function resolverVencimientoCurso(
  e: EntradaReglaVencimiento,
): ResultadoReglaVencimiento {
  const venc = isoValida(e.fechaVencimientoDocumento);
  if (venc) return { fechaVencimiento: venc, origen: 'DOCUMENTO', base: null };

  if (
    e.nombreCurso &&
    CURSOS_SIN_VENCIMIENTO.some((re) => re.test(normalizar(e.nombreCurso!)))
  ) {
    return { fechaVencimiento: null, origen: 'SIN_VENCIMIENTO', base: null };
  }

  const inicio = isoValida(e.fechaInicio);
  const emision = isoValida(e.fechaEmision);
  const base = inicio
    ? { campo: 'fechaInicio' as const, fecha: inicio }
    : emision
      ? { campo: 'fechaEmision' as const, fecha: emision }
      : null;
  if (!base) {
    return { fechaVencimiento: null, origen: 'REQUIERE_REVISION', base: null };
  }
  return {
    fechaVencimiento: sumarAnios(base.fecha, ANIOS_VIGENCIA_CURSO),
    origen: 'CALCULADO_5_ANOS',
    base,
  };
}

/**
 * Origen de un curso guardado antes de existir `origenVencimiento`: se
 * deduce sin cambiar nada (la migración lo guarda).
 * - con vencimiento estimado → CALCULADO_5_ANOS
 * - con vencimiento y documento → DOCUMENTO
 * - con vencimiento sin documento (lo capturó el postulante) → null
 * - sin vencimiento y con documento → REQUIERE_REVISION
 * - sin vencimiento ni documento → null ("Sin documento")
 */
export function origenVencimientoDeCurso(curso: {
  origenVencimiento?: OrigenVencimiento | null;
  fechaVencimiento?: Date | string | null;
  fechaVencimientoEstimada?: boolean;
  documentoExtra?: unknown;
}): OrigenVencimiento | null {
  if (curso.origenVencimiento) return curso.origenVencimiento;
  if (curso.fechaVencimiento) {
    if (curso.fechaVencimientoEstimada) return 'CALCULADO_5_ANOS';
    return curso.documentoExtra ? 'DOCUMENTO' : null;
  }
  return curso.documentoExtra ? 'REQUIERE_REVISION' : null;
}

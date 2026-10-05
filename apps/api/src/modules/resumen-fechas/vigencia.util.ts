/**
 * Semáforo de vigencia de cursos y documentos.
 *
 * Se calcula al momento de responder (nunca se guarda en BD) comparando la
 * fecha de vencimiento contra la fecha actual en la zona horaria de México.
 */
import {
  hoyISO,
  ZONA_HORARIA_MEXICO,
} from '../../common/utils/fecha-mexico.util';

export { hoyISO };

/**
 * sin_fecha: el tipo sí vence pero no se detectó la fecha (dato faltante).
 * no_aplica: el tipo no tiene vencimiento (CURP, acta de nacimiento…).
 */
export type EstadoVigencia =
  | 'vencido'
  | 'por_vencer'
  | 'vigente'
  | 'sin_fecha'
  | 'no_aplica';

/** Meses antes del vencimiento a partir de los cuales se marca "por vencer". */
export const UMBRAL_POR_VENCER_MESES = 6;

/** Zona horaria para decidir qué día es "hoy" (el servidor corre en UTC). */
export const ZONA_HORARIA_VIGENCIA = ZONA_HORARIA_MEXICO;

/** Orden de la tabla: vencidos primero. */
export const ORDEN_ESTADO_VIGENCIA: Record<EstadoVigencia, number> = {
  vencido: 0,
  por_vencer: 1,
  vigente: 2,
  sin_fecha: 3,
  no_aplica: 4,
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function parseISO(fecha: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Suma meses de calendario; si el día no existe (31 → feb) usa el último del mes. */
function sumarMeses(fecha: Date, meses: number): Date {
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(fecha.getUTCDate(), ultimoDia)));
}

export interface ResultadoVigencia {
  estadoVigencia: EstadoVigencia;
  /** Días que faltan para vencer (negativo si ya venció); null sin fecha. */
  diasParaVencer: number | null;
}

/**
 * @param fechaVencimiento YYYY-MM-DD o null
 * @param hoy YYYY-MM-DD (por defecto, hoy en México)
 *
 * Vence el mismo día → sigue vigente ese día (vencido = vencimiento < hoy).
 */
export function calcularEstadoVigencia(
  fechaVencimiento: string | null | undefined,
  hoy: string = hoyISO(),
  umbralMeses: number = UMBRAL_POR_VENCER_MESES,
): ResultadoVigencia {
  const venc = fechaVencimiento ? parseISO(fechaVencimiento) : null;
  const base = parseISO(hoy);
  if (!venc || !base) {
    return { estadoVigencia: 'sin_fecha', diasParaVencer: null };
  }

  const diasParaVencer = Math.round(
    (venc.getTime() - base.getTime()) / MS_POR_DIA,
  );

  if (venc < base) return { estadoVigencia: 'vencido', diasParaVencer };
  if (venc <= sumarMeses(base, umbralMeses)) {
    return { estadoVigencia: 'por_vencer', diasParaVencer };
  }
  return { estadoVigencia: 'vigente', diasParaVencer };
}

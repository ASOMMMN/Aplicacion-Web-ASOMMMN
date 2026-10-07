/**
 * Metadatos por fecha (documentos personales y cursos). Los campos Date
 * (fechaEmision, fechaInicio, fechaVencimiento) se conservan: los usan la
 * vigencia, las alertas, el resumen y el expediente. Aquí va de dónde salió
 * cada fecha, con qué precisión y confianza, su evidencia y si está
 * bloqueada por una corrección manual.
 *
 * Fechas parciales: se guardan completadas para poder calcular (vencimiento
 * con precisión año → 31/12, mes → último día; emisión/inicio → 01/01 o día
 * 1), pero se muestran solo con lo que se sabe ("2033", "abr 2026").
 */
import { Types } from 'mongoose';
import type { PrecisionFecha } from './formatos-fecha';

export type CampoMeta = 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento';
export const CAMPOS_META: CampoMeta[] = [
  'fechaEmision',
  'fechaInicio',
  'fechaVencimiento',
];

/**
 * ia = leída del documento (IA o lectores deterministas: QR, texto, MRZ);
 * manual = corregida por un evaluador (o capturada por el postulante);
 * regla = calculada (cursos: inicio/emisión + 5 años);
 * cv = tomada del CV.
 */
export type FuenteMeta = 'ia' | 'manual' | 'regla' | 'cv';
export const FUENTES_META: FuenteMeta[] = ['ia', 'manual', 'regla', 'cv'];

export type ConfianzaTexto = 'alta' | 'media' | 'baja';

/** Confianza numérica expuesta (0–1). Menor a 0.7 = baja → Revisar. */
export const CONFIANZA_NUMERICA: Record<ConfianzaTexto, number> = {
  alta: 0.9,
  media: 0.7,
  baja: 0.4,
};
export const UMBRAL_CONFIANZA = 0.7;

export const aConfianzaNumerica = (c?: string | null): number | undefined =>
  c === 'alta' || c === 'media' || c === 'baja'
    ? CONFIANZA_NUMERICA[c]
    : undefined;

export interface MetaFecha {
  fuente: FuenteMeta;
  precision: PrecisionFecha;
  /** 0–1 (alta 0.9, media 0.7, baja 0.4). */
  confianza?: number;
  /** Texto literal del documento de donde salió. */
  evidencia?: string | null;
  /** Lector que la dio cuando fuente = ia: qr, texto (etiqueta/MRZ) o ia. */
  lector?: string | null;
  /** Corrección manual: "Volver a analizar" no la sobrescribe. */
  bloqueada: boolean;
  editadoPor?: Types.ObjectId | null;
  editadoPorEmail?: string | null;
  editadoEn?: Date | null;
}

export type MetaFechas = Partial<Record<CampoMeta, MetaFecha>>;

/** Un cambio de una fecha (quién, cuándo, valor anterior → nuevo). */
export interface CambioFecha {
  campo: CampoMeta;
  anterior: { valor: string | null; precision: PrecisionFecha } | null;
  nuevo: { valor: string | null; precision: PrecisionFecha } | null;
  fuente: FuenteMeta;
  /** Qué lo provocó: subida, reanálisis, corrección, propuesta aceptada… */
  motivo: string;
  por?: Types.ObjectId | null;
  porEmail?: string | null;
  en: Date;
}

/** Máximo de cambios que se guardan por documento (los más recientes). */
export const MAX_HISTORIAL = 100;

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * Cambios entre las fechas de antes y las de después (solo los campos que
 * cambiaron de valor o de precisión).
 */
export function cambiosDeFechas(
  antes: Partial<Record<CampoMeta, Date | string | null | undefined>>,
  precisionAntes: Partial<Record<CampoMeta, PrecisionFecha>> | undefined,
  despues: Partial<Record<CampoMeta, Date | string | null | undefined>>,
  precisionDespues: Partial<Record<CampoMeta, PrecisionFecha>> | undefined,
  datos: Omit<CambioFecha, 'campo' | 'anterior' | 'nuevo'>,
  campos: CampoMeta[] = CAMPOS_META,
): CambioFecha[] {
  const cambios: CambioFecha[] = [];
  for (const campo of campos) {
    if (!(campo in despues)) continue;
    const a = iso(antes[campo]);
    const n = iso(despues[campo]);
    const pa = precisionAntes?.[campo] ?? 'dia';
    const pn = precisionDespues?.[campo] ?? 'dia';
    if (a === n && (a === null || pa === pn)) continue;
    cambios.push({
      campo,
      anterior:
        a || antes[campo] !== undefined ? { valor: a, precision: pa } : null,
      nuevo: { valor: n, precision: pn },
      ...datos,
    });
  }
  return cambios;
}

/** Agrega cambios al historial conservando los más recientes. */
export function agregarHistorial(
  historial: CambioFecha[] | undefined | null,
  nuevos: CambioFecha[],
): CambioFecha[] {
  return [...(historial ?? []), ...nuevos].slice(-MAX_HISTORIAL);
}

/** Campos bloqueados por una corrección manual. */
export const camposBloqueados = (meta?: MetaFechas | null): CampoMeta[] =>
  CAMPOS_META.filter((c) => meta?.[c]?.bloqueada);

/**
 * Fecha guardada para una fecha parcial (para calcular vigencia y alertas):
 * vencimiento año → 31/12, mes → último día; emisión/inicio año → 01/01,
 * mes → día 1. Día: la fecha tal cual. En pantalla se muestra solo lo que
 * se sabe (formatearConPrecision).
 */
export function completarFecha(
  iso: string,
  precision: PrecisionFecha,
  campo: CampoMeta,
): string {
  const [y, m] = iso.split('-').map(Number);
  const fin = campo === 'fechaVencimiento';
  if (precision === 'anio') return fin ? `${y}-12-31` : `${y}-01-01`;
  if (precision === 'mes') {
    const dia = fin ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 1;
    return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return iso.slice(0, 10);
}

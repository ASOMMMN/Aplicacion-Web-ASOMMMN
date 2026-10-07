/**
 * metaFechas de registros anteriores al campo (2026-10-06), deducidos sin
 * cambiar nada: se usan al leer y en la migración (scripts/migrar-meta-fechas.ts).
 *
 * Documentos personales:
 * - con fechasVerificadas → fuente manual, bloqueada, con quién y cuándo;
 * - si no → fuente ia, con la confianza y la evidencia de detalleFechasIa.
 * Cursos:
 * - vencimiento estimado (CALCULADO_5_ANOS) → fuente regla;
 * - con documento → ia; sin documento (capturado a mano) → manual.
 * La precisión sale de precisionFechas; si falta, se infiere del texto
 * literal guardado (p. ej. "VIGENCIA 2021 - 2031" → año).
 */
import type { Types } from 'mongoose';
import { leerFechaLiteral, PrecisionFecha } from './formatos-fecha';
import {
  aConfianzaNumerica,
  CAMPOS_META,
  CampoMeta,
  MetaFecha,
  MetaFechas,
} from './meta-fechas';

interface ConFechas {
  fechaEmision?: Date | string | null;
  fechaInicio?: Date | string | null;
  fechaVencimiento?: Date | string | null;
  precisionFechas?: Partial<Record<CampoMeta, PrecisionFecha>> | null;
  detalleFechasIa?: unknown;
  metaFechas?: MetaFechas | null;
}

interface DetalleCampo {
  confianza?: string;
  textoLiteral?: string | null;
}

function detalleDe(doc: ConFechas, campo: CampoMeta) {
  const d = doc.detalleFechasIa as
    | (Partial<Record<CampoMeta, DetalleCampo>> & {
        fuentes?: Partial<Record<CampoMeta, { fuente?: string }>>;
      })
    | null
    | undefined;
  return { campo: d?.[campo], fuente: d?.fuentes?.[campo]?.fuente ?? null };
}

/** Precisión guardada o, si falta, la del texto literal (nunca inventa día). */
export function precisionInferida(
  doc: ConFechas,
  campo: CampoMeta,
): PrecisionFecha {
  const guardada = doc.precisionFechas?.[campo];
  if (guardada) return guardada;
  const literal = detalleDe(doc, campo).campo?.textoLiteral;
  return leerFechaLiteral(literal)?.precision ?? 'dia';
}

export interface FechasVerificadasLegado {
  verificadoPor?: Types.ObjectId | null;
  verificadoPorEmail?: string | null;
  verificadoEn?: Date | null;
}

export function metaFechasDocPersonal(
  doc: ConFechas & { fechasVerificadas?: FechasVerificadasLegado | null },
): MetaFechas {
  if (doc.metaFechas) return doc.metaFechas;
  const meta: MetaFechas = {};
  const fv = doc.fechasVerificadas;
  for (const c of CAMPOS_META) {
    if (!doc[c]) continue;
    const precision = precisionInferida(doc, c);
    if (fv) {
      meta[c] = {
        fuente: 'manual',
        precision,
        bloqueada: true,
        editadoPor: fv.verificadoPor ?? null,
        editadoPorEmail: fv.verificadoPorEmail ?? null,
        editadoEn: fv.verificadoEn ?? null,
      };
      continue;
    }
    const { campo, fuente } = detalleDe(doc, c);
    meta[c] = {
      fuente: 'ia',
      precision,
      confianza: aConfianzaNumerica(campo?.confianza),
      evidencia: campo?.textoLiteral ?? null,
      lector: fuente,
      bloqueada: false,
    };
  }
  return meta;
}

export function metaFechasCurso(
  curso: ConFechas & {
    origenVencimiento?: string | null;
    fechaVencimientoEstimada?: boolean;
    documentoExtra?: unknown;
    confianza?: Partial<Record<CampoMeta, string>> | null;
  },
): MetaFechas {
  if (curso.metaFechas) return curso.metaFechas;
  const meta: MetaFechas = {};
  for (const c of CAMPOS_META) {
    if (!curso[c]) continue;
    const estimada =
      c === 'fechaVencimiento' &&
      (curso.origenVencimiento === 'CALCULADO_5_ANOS' ||
        curso.fechaVencimientoEstimada);
    const { campo } = detalleDe(curso, c);
    const m: MetaFecha = {
      fuente: estimada ? 'regla' : curso.documentoExtra ? 'ia' : 'manual',
      precision: precisionInferida(curso, c),
      bloqueada: false,
    };
    if (m.fuente === 'ia') {
      m.confianza = aConfianzaNumerica(
        curso.confianza?.[c] ?? campo?.confianza,
      );
      m.evidencia = campo?.textoLiteral ?? null;
    }
    meta[c] = m;
  }
  return meta;
}

/** Metadatos tal como salen en la API (ids como texto, fechas ISO). */
export interface MetaFechaResumen {
  fuente: MetaFecha['fuente'];
  precision: PrecisionFecha;
  confianza: number | null;
  evidencia: string | null;
  lector: string | null;
  bloqueada: boolean;
  editadoPorEmail: string | null;
  editadoEn: string | null;
}

export function resumenMetaFechas(
  meta: MetaFechas,
): Partial<Record<CampoMeta, MetaFechaResumen>> {
  return Object.fromEntries(
    Object.entries(meta).map(([c, m]) => [
      c,
      {
        fuente: m.fuente,
        precision: m.precision,
        confianza: m.confianza ?? null,
        evidencia: m.evidencia ?? null,
        lector: m.lector ?? null,
        bloqueada: Boolean(m.bloqueada),
        editadoPorEmail: m.editadoPorEmail ?? null,
        editadoEn: m.editadoEn ? new Date(m.editadoEn).toISOString() : null,
      },
    ]),
  );
}

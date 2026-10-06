/**
 * Plan de la migración de vencimientos de cursos (scripts/migrar-vencimientos-cursos.ts).
 * Puro: decide qué cambiaría en un curso guardado, sin escribir.
 */
import type { Document, WithId } from 'mongodb';
import {
  OrigenVencimiento,
  resolverVencimientoCurso,
  sumarAnios,
} from './regla-vencimiento-curso';

export interface CursoGuardado extends WithId<Document> {
  nombreCurso: string;
  postulanteId?: { toString(): string };
  fechaInicio?: Date | null;
  fechaEmision?: Date | null;
  fechaVencimiento?: Date | null;
  fechaVencimientoEstimada?: boolean;
  origenVencimiento?: OrigenVencimiento;
  documentoExtra?: unknown;
}

export type Accion =
  | 'sin cambios: vencimiento explícito'
  | 'sin cambios: sin documento'
  | 'marcar estimado existente'
  | 'calcular +5 años'
  | 'requiere revisión';

export interface PlanCurso {
  accion: Accion;
  $set: Record<string, unknown> | null;
  nota: string;
}

const iso = (d?: Date | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

/** Qué haría la migración con un curso (puro: no escribe). */
export function planificar(c: CursoGuardado): PlanCurso {
  const venc = iso(c.fechaVencimiento);
  if (venc && !c.fechaVencimientoEstimada) {
    return {
      accion: 'sin cambios: vencimiento explícito',
      $set: null,
      nota: venc,
    };
  }
  if (venc && c.fechaVencimientoEstimada) {
    const base = iso(c.fechaInicio) ?? iso(c.fechaEmision);
    const coincide = base && sumarAnios(base, 5) === venc;
    return {
      accion: 'marcar estimado existente',
      $set: { origenVencimiento: 'CALCULADO_5_ANOS' },
      nota: coincide
        ? `${venc} = base ${base} + 5 años`
        : `${venc} (no coincide con base + 5 años; la fecha no se cambia)`,
    };
  }
  if (!c.documentoExtra) {
    return { accion: 'sin cambios: sin documento', $set: null, nota: '' };
  }
  const r = resolverVencimientoCurso({
    fechaInicio: iso(c.fechaInicio),
    fechaEmision: iso(c.fechaEmision),
    nombreCurso: c.nombreCurso,
  });
  if (r.origen === 'CALCULADO_5_ANOS' && r.fechaVencimiento) {
    return {
      accion: 'calcular +5 años',
      $set: {
        fechaVencimiento: new Date(`${r.fechaVencimiento}T00:00:00.000Z`),
        fechaVencimientoEstimada: true,
        origenVencimiento: 'CALCULADO_5_ANOS',
      },
      nota: `${r.base!.fecha} (${r.base!.campo}) → ${r.fechaVencimiento}`,
    };
  }
  return {
    accion: 'requiere revisión',
    $set: {
      origenVencimiento: r.origen,
      revisarFechas: true,
      motivosRevision: [
        'Sin fecha de inicio ni de emisión: no se puede estimar el vencimiento.',
      ],
    },
    nota: 'sin fecha base',
  };
}

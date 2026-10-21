import type { EstadoCandidato } from '../dto/listar-candidatos-query.dto';

export interface CandidatoEstadoInput {
  porcentajeExpediente: number;
  estadoExpediente: 'en_proceso' | 'enviado';
  estadoEvaluacion: 'pendiente' | 'en_evaluacion' | 'evaluado';
}

/**
 * Espejo de apps/web/src/lib/estadoCandidato.ts#estadoGeneral — misma
 * prioridad (evaluado > enviado > %avance) y mismas 5 definiciones. Se
 * duplica aquí porque el filtro `estado` de GET /evaluaciones/candidatos
 * necesita evaluar esta misma regla en el servidor.
 */
export function estadoGeneral(input: CandidatoEstadoInput): EstadoCandidato {
  if (input.estadoEvaluacion === 'evaluado') return 'evaluado';
  if (input.estadoExpediente === 'enviado') return 'enviado';
  if (input.porcentajeExpediente >= 100) return 'completo';
  if (input.porcentajeExpediente > 0) return 'en_proceso';
  return 'incompleto';
}

/** Espejo de ESTADO_GENERAL_CONFIG[...].label en el frontend, para el export CSV. */
export const ESTADO_GENERAL_LABEL: Record<EstadoCandidato, string> = {
  incompleto: 'Incompleto',
  en_proceso: 'En proceso',
  completo: 'Completo',
  enviado: 'Enviado',
  evaluado: 'Evaluado',
};

/** Orden lógico del flujo, para `ordenarPor=estadoGeneral` (no alfabético). */
export const ESTADO_GENERAL_RANGO: Record<EstadoCandidato, number> = {
  incompleto: 0,
  en_proceso: 1,
  completo: 2,
  enviado: 3,
  evaluado: 4,
};

export type EstadoGeneral = 'incompleto' | 'en_proceso' | 'completo' | 'enviado' | 'evaluado';

export interface CandidatoEstadoInput {
  porcentajeExpediente: number;
  estadoExpediente: 'en_proceso' | 'enviado';
  estadoEvaluacion: 'pendiente' | 'en_evaluacion' | 'evaluado';
}

interface EstadoGeneralConfig {
  label: string;
  badgeClass: string;
  icon: string;
  color: string;
}

export const ESTADO_GENERAL_CONFIG: Record<EstadoGeneral, EstadoGeneralConfig> = {
  incompleto: { label: 'Incompleto', badgeClass: 'badge-estado-rechazado', icon: 'bi-x-lg',               color: '#C0392B' },
  en_proceso: { label: 'En proceso', badgeClass: 'badge-estado-proceso',   icon: 'bi-clock',               color: 'var(--asommmn-dorado)' },
  completo:   { label: 'Completo',   badgeClass: 'badge-estado-aprobado', icon: 'bi-check-lg',             color: 'var(--asommmn-verde)' },
  enviado:    { label: 'Enviado',    badgeClass: 'badge-estado-enviado',  icon: 'bi-send',                 color: 'var(--asommmn-azul)' },
  evaluado:   { label: 'Evaluado',   badgeClass: 'badge-estado-evaluado', icon: 'bi-patch-check-fill',     color: '#0F6E4F' },
};

/**
 * Estado general único del expediente/postulación de un candidato: la única
 * fuente de verdad para el badge de "Estado postulación" y para la columna
 * de "Documentos" en el panel de evaluador, de modo que nunca se muestren
 * dos estados contradictorios para el mismo candidato.
 *
 * Definiciones:
 * - incompleto: el postulante no ha cargado ningún documento requerido (0% de avance).
 * - en_proceso: cargó algunos documentos requeridos pero no todos (0% < avance < 100%).
 * - completo:   cargó todos los documentos requeridos pero aún no envió su postulación.
 * - enviado:    finalizó y envió su expediente para evaluación; ya no puede editarlo.
 * - evaluado:   un evaluador ya evaluó los documentos del expediente enviado.
 *
 * Prioridad (de mayor a menor): evaluado > enviado > completo/en_proceso/incompleto
 * (estos tres últimos, derivados únicamente del % de avance).
 */
export function estadoGeneral(input: CandidatoEstadoInput): EstadoGeneral {
  if (input.estadoEvaluacion === 'evaluado') return 'evaluado';
  if (input.estadoExpediente === 'enviado') return 'enviado';
  if (input.porcentajeExpediente >= 100) return 'completo';
  if (input.porcentajeExpediente > 0) return 'en_proceso';
  return 'incompleto';
}

/** Agrupa los 5 estados en 3 grupos de avance, para las tarjetas de resumen y su filtro rápido. */
export type GrupoAvance = 'completo' | 'en_proceso' | 'incompleto';

export function grupoAvance(estado: EstadoGeneral): GrupoAvance {
  if (estado === 'incompleto') return 'incompleto';
  if (estado === 'en_proceso') return 'en_proceso';
  return 'completo'; // completo | enviado | evaluado: ya tienen el expediente 100% cargado
}

import type { CursoCV } from '../ingest-ia/schemas/extraccion.schema';
import type { EstadoVigencia } from './vigencia.util';

/**
 * Origen del dato:
 * - subido: curso registrado por el postulante con su documento
 * - cv: curso detectado en el CV por la IA
 * - subido_y_cv: el mismo curso aparece en ambos (prevalecen los datos subidos)
 * - doc_personal: documento personal (pasaporte, libreta de mar, etc.)
 */
export type OrigenResumen = 'subido' | 'cv' | 'subido_y_cv' | 'doc_personal';

/** El CV y el documento subido dicen vencimientos distintos para el mismo curso. */
export interface DiscrepanciaVencimiento {
  fechaVencimientoSubido: string;
  fechaVencimientoCV: string;
}

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';
  nombre: string;
  institucion: string | null;
  /** null = el origen no la indica (nunca se infiere). */
  fechaInicio: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  /**
   * true = el vencimiento no lo dio el postulante ni el CV: lo calculó el
   * sistema (inicio + 5 años). Si hay una fecha real, esta la reemplaza.
   */
  fechaVencimientoEstimada: boolean;
  /** Confianza de la IA para las fechas tomadas del CV (si la devolvió). */
  confianzaCV: CursoCV['confianza'] | null;
  origen: OrigenResumen;
  /** Nombre tal como aparece en el CV, cuando se unió con un curso subido. */
  nombreEnCV: string | null;
  discrepancia: DiscrepanciaVencimiento | null;
  /** Calculado al responder; no se guarda en BD. */
  estadoVigencia: EstadoVigencia;
  diasParaVencer: number | null;
  fuente: string[];
}

export type ConteoVigencia = Record<EstadoVigencia, number>;

export interface ResumenFechasResponse {
  titulo: string;
  postulante: string;
  fechaGeneracion: string;
  /** Fecha (México) contra la que se calculó el semáforo. */
  fechaReferencia: string;
  umbralPorVencerMeses: number;
  conteo: ConteoVigencia;
  items: ResumenFechaItem[];
}

/** Ítem antes de calcular la vigencia. */
export type ItemBase = Omit<
  ResumenFechaItem,
  'estadoVigencia' | 'diasParaVencer'
>;

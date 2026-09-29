/** Tipos de GET /resumen-fechas/postulante/:postulanteId */

export type EstadoVigencia = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha';

export type ConfianzaIa = 'alta' | 'media' | 'baja';

export type OrigenResumen ='subido' | 'cv' | 'subido_y_cv' | 'doc_personal';

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';
  nombre: string;
  institucion: string | null;
  /** null = el origen no la indica (nunca se infiere). */
  fechaInicio: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  /** El vencimiento lo calculó el sistema (inicio + 5 años), no viene de un documento. */
  fechaVencimientoEstimada: boolean;
  /** Confianza de la IA para las fechas tomadas del CV (si la devolvió). */
  confianzaCV: {
    fechaInicio?: ConfianzaIa;
    fechaEmision?: ConfianzaIa;
    fechaVencimiento?: ConfianzaIa;
  } | null;
  origen: OrigenResumen;
  /** Nombre tal como aparece en el CV, cuando se unió con un curso subido. */
  nombreEnCV: string | null;
  /** El CV y el documento subido dicen vencimientos distintos. */
  discrepancia: {
    fechaVencimientoSubido: string;
    fechaVencimientoCV: string;
  } | null;
  estadoVigencia: EstadoVigencia;
  diasParaVencer: number | null;
  fuente: string[];
}

export interface ResumenFechasResponse {
  titulo: string;
  postulante: string;
  fechaGeneracion: string;
  fechaReferencia: string;
  umbralPorVencerMeses: number;
  conteo: Record<EstadoVigencia, number>;
  items: ResumenFechaItem[];
}

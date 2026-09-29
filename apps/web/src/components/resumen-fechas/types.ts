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
  /** Confianza de la IA para las fechas tomadas del CV (si la devolvió). */
  confianzaCV: {
    fechaInicio?: ConfianzaIa;
    fechaEmision?: ConfianzaIa;
    fechaVencimiento?: ConfianzaIa;
  } | null;
  origen: OrigenResumen;
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

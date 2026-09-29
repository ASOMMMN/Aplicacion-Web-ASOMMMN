/** Tipos de GET /resumen-fechas/postulante/:postulanteId */

export type EstadoVigencia = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha';

export type OrigenResumen = 'subido' | 'cv' | 'subido_y_cv' | 'doc_personal';

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';
  nombre: string;
  institucion: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
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

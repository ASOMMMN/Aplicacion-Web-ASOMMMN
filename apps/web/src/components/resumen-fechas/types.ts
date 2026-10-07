/** Tipos de GET /resumen-fechas/postulante/:postulanteId */
import type { OrigenVencimiento } from '@/lib/fechas';

/** sin_fecha = vence pero falta la fecha; no_aplica = el tipo no vence. */
export type EstadoVigencia = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha' | 'no_aplica';

export type ConfianzaIa = 'alta' | 'media' | 'baja';

/** "dia" = fecha completa; "mes" = 04/2025; "anio" = 2016 (el documento no trae más). */
export type PrecisionFecha = 'dia' | 'mes' | 'anio';

export type OrigenResumen ='subido' | 'cv' | 'subido_y_cv' | 'doc_personal';

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';
  /** Cursos: nombre del curso. Documentos personales: etiqueta del tipo. */
  nombre: string;
  /** Documentos personales: nombre del archivo usado (el más reciente). */
  detalle: string | null;
  aplicaVencimiento: boolean;
  institucion: string | null;
  /** null = el origen no la indica (nunca se infiere). */
  fechaInicio: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  /** Precisión de cada fecha según el documento (ausente = día). */
  precisionFechas?: Partial<Record<'fechaInicio' | 'fechaEmision' | 'fechaVencimiento', PrecisionFecha>>;
  /** El vencimiento no viene del documento: inicio (o emisión) + 5 años. */
  fechaVencimientoEstimada: boolean;
  /**
   * Cursos: DOCUMENTO | CALCULADO_5_ANOS | SIN_VENCIMIENTO | REQUIERE_REVISION.
   * null = sin documento del curso (solo CV) o vencimiento tomado del CV.
   */
  origenVencimiento?: OrigenVencimiento | null;
  /** Curso sin documento subido (solo aparece en el CV). */
  sinDocumento?: boolean;
  /** Cursos registrados: confianza de cada fecha leída del documento. */
  confianzaDocumento?: Partial<Record<'fechaInicio' | 'fechaEmision' | 'fechaVencimiento', ConfianzaIa>> | null;
  /** Cursos registrados que necesitan revisión, con sus motivos. */
  revisarFechasCurso?: { motivos: string[] } | null;
  /**
   * Por fecha: fuente (ia | manual | regla | cv), precisión, confianza 0–1,
   * evidencia y si está bloqueada por una corrección manual.
   */
  metaFechas?: Partial<Record<CampoFecha, MetaFechaResumen>>;
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
  /** Solo documentos personales: el archivo usado y su análisis. */
  docPersonal?: DocPersonalResumen;
}

export interface DocPersonalResumen {
  id: string;
  revisarFechas: boolean;
  motivosRevision: string[];
  /** El evaluador corrigió las fechas a mano. */
  fechasVerificadas: boolean;
  extraccionEstado: EstadoExtraccion;
  /** Motivo cuando extraccionEstado = 'error'. */
  extraccionError: string | null;
  /**
   * De dónde salió cada fecha y si otra fuente la confirma. Ausente en
   * documentos analizados antes de la combinación de fuentes o verificados.
   */
  fuentesFechas?: Partial<Record<CampoFecha, FuenteFechaResumen>>;
  /** Solo si el archivo trae más de un documento. */
  documentosDetectados?: DocumentoDetectado[];
  /** Fechas de un reanálisis que no se aplicaron solas (null = ninguna). */
  propuesta?: PropuestaFechas | null;
  /** Archivos de este tipo; las fechas salen del documento ganador. */
  archivosDelTipo?: number;
  /** Campos vacíos que se completaron con otro archivo del mismo documento. */
  fechasDeOtroArchivo?: Partial<Record<CampoFecha, { id: string; nombre: string }>>;
}

export interface PropuestaFechas {
  fechas: Partial<
    Record<CampoFecha, { valor: string | null; precision: PrecisionFecha; anterior: string | null }>
  >;
  motivos: string[];
  detectadaEn: string | null;
}

export type CampoFecha = 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento';

/** ia = leída del documento; manual = corregida a mano; regla = estimada (+5 años); cv = del CV. */
export type FuenteMeta = 'ia' | 'manual' | 'regla' | 'cv';

/** Menor a esto = confianza baja → revisar (igual que la API). */
export const UMBRAL_CONFIANZA = 0.7;

export interface MetaFechaResumen {
  fuente: FuenteMeta;
  precision: PrecisionFecha;
  /** 0–1 (alta 0.9, media 0.7, baja 0.4). */
  confianza: number | null;
  /** Texto literal del documento de donde salió. */
  evidencia: string | null;
  /** Lector cuando fuente = ia: qr, texto o ia. */
  lector: string | null;
  /** Corrección manual: "Volver a analizar" no la cambia. */
  bloqueada: boolean;
  editadoPorEmail: string | null;
  editadoEn: string | null;
}

/** qr = QR o cadena original; texto = etiqueta en el texto del PDF; ia = modelo. */
export type FuenteFecha = 'qr' | 'texto' | 'ocr' | 'ia';

export interface FuenteFechaResumen {
  fuente: FuenteFecha;
  /** Una fuente determinista y la IA dicen lo mismo (o la dio el QR). */
  coincidente: boolean;
  /** La fecha quedó en confianza baja: verifícala contra el documento. */
  revisar: boolean;
}

export interface DocumentoDetectado {
  /** Sus fechas son las que se muestran en la fila (vencimiento más reciente). */
  principal: boolean;
  paginas: number[];
  fechas: Partial<Record<CampoFecha, { valor: string; precision: PrecisionFecha; fuente: FuenteFecha }>>;
}

/**
 * pendiente = nunca se analizó; ok; sin_fechas = se analizó y el documento no
 * muestra fechas; error = falló o se descartaron las fechas (ver extraccionError).
 */
export type EstadoExtraccion = 'pendiente' | 'ok' | 'sin_fechas' | 'error';

export interface ResumenFechasResponse {
  titulo: string;
  postulante: string;
  fechaGeneracion: string;
  fechaReferencia: string;
  umbralPorVencerMeses: number;
  conteo: Record<EstadoVigencia, number>;
  items: ResumenFechaItem[];
}

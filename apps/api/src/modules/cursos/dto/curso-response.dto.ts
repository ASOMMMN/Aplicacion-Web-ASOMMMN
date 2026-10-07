import type { EstadoVigencia } from '../../resumen-fechas/vigencia.util';
import type { OrigenVencimiento } from '../regla-vencimiento-curso';
import type { EstadoExtraccion } from '../../docs-personales/ia/estado-extraccion';
import type { PrecisionFecha } from '../../docs-personales/ia/formatos-fecha';
import type { MetaFechaResumen } from '../../docs-personales/ia/meta-fechas-derivadas';

type Confianza = 'alta' | 'media' | 'baja';

export class CursoItemResponseDto {
  _id: string;
  nombreCurso: string;
  institucion?: string;
  fechaCurso: string;
  fechaInicio?: string;
  /** Expedición/emisión del certificado. */
  fechaEmision?: string;
  fechaVencimiento?: string;
  /** El vencimiento no viene del documento: inicio/emisión + 5 años. */
  fechaVencimientoEstimada: boolean;
  /**
   * DOCUMENTO | CALCULADO_5_ANOS | SIN_VENCIMIENTO | REQUIERE_REVISION.
   * null = sin documento (el vencimiento, si hay, lo capturó el postulante).
   */
  origenVencimiento: OrigenVencimiento | null;
  /** Misma regla y misma fecha de "hoy" (México) que /resumen-fechas. */
  estadoVigencia: EstadoVigencia;
  diasParaVencer: number | null;
  apareceEnCV: boolean;
  tieneDocumentoExtra: boolean;
  documentoExtra?: {
    nombreOriginal: string;
    tamanio: number;
    tipoMime: string;
    urlDescargar?: string;
    /** Vista previa (Content-Disposition: inline, TTL 15 min). */
    urlVista?: string;
    storageType: 'local' | 'cloudinary';
  };
  /** Confianza de la IA por campo leído del documento. */
  confianza?: Partial<
    Record<
      'nombreCurso' | 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      Confianza
    >
  >;
  extraccionEstado?: EstadoExtraccion;
  revisarFechas: boolean;
  motivosRevision: string[];
  /** Fuente, precisión, confianza, evidencia y bloqueo de cada fecha. */
  metaFechas?: Partial<
    Record<
      'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      MetaFechaResumen
    >
  >;
  creadoEn: string;
}

/**
 * Propuesta de la IA para el formulario de un curso (no guarda nada). Usa
 * la misma canalización que los documentos personales (tipo "curso").
 */
export class ExtraerIaResponseDto {
  nombreCurso: string | null;
  institucion?: string | null;
  fechaInicio: string | null;
  /** Expedición/emisión del certificado. */
  fechaEmision: string | null;
  /** Solo si el documento trae vencimiento explícito; nunca calculado. */
  fechaVencimiento: string | null;
  /** Fin del periodo de impartición (evidencia; nunca es el vencimiento). */
  fechaFinCurso?: string | null;
  precision?: Partial<
    Record<'fechaInicio' | 'fechaEmision' | 'fechaVencimiento', PrecisionFecha>
  >;
  confianza: {
    nombreCurso: string;
    fechaInicio: string;
    fechaVencimiento: string;
    fechaEmision?: string;
  };
  /**
   * Vencimiento que se guardará al registrar el curso con este documento:
   * el del documento o el estimado a 5 años (o REQUIERE_REVISION).
   */
  vencimientoPropuesto?: {
    fecha: string | null;
    origen: OrigenVencimiento;
    base: { campo: 'fechaInicio' | 'fechaEmision'; fecha: string } | null;
  };
  revisar?: boolean;
  motivosRevision?: string[];
  iaDisponible: boolean;
  errorMensaje?: string;
}

export class CursosListResponseDto {
  postulante: {
    id: string;
    nombreCompleto: string;
    email: string;
  };
  cursos: CursoItemResponseDto[];
  total: number;
}

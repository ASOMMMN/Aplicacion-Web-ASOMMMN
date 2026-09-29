import type { EstadoVigencia } from '../../resumen-fechas/vigencia.util';

export class CursoItemResponseDto {
  _id: string;
  nombreCurso: string;
  institucion?: string;
  fechaCurso: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  /** El vencimiento lo calculó el sistema (inicio + 5 años), no el postulante. */
  fechaVencimientoEstimada: boolean;
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
    storageType: 'local' | 'cloudinary';
  };
  creadoEn: string;
}

export class ExtraerIaResponseDto {
  nombreCurso: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  /** Fecha de finalización/emisión del certificado cuando no hay inicio ni vencimiento explícitos */
  fechaEmision: string | null;
  confianza: {
    nombreCurso: string;
    fechaInicio: string;
    fechaVencimiento: string;
  };
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

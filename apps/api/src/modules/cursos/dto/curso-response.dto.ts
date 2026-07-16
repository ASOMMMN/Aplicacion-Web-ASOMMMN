export class CursoItemResponseDto {
  _id: string;
  nombreCurso: string;
  institucion?: string;
  fechaCurso: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
  apareceEnCV: boolean;
  tieneDocumentoExtra: boolean;
  documentoExtra?: {
    nombreOriginal: string;
    tamanio: number;
    tipoMime: string;
    urlDescargar: string;
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

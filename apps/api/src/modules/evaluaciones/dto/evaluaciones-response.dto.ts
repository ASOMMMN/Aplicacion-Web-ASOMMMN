import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidatoListaItemDto {
  @ApiProperty()
  postulanteId: string;

  @ApiProperty()
  nombreCompleto: string;

  /** Nombre(s) de pila, por separado, para calcular iniciales sin ambigüedad en el frontend. */
  @ApiProperty()
  nombre: string;

  /** Apellido(s), por separado, para calcular iniciales sin ambigüedad en el frontend. */
  @ApiProperty()
  apellidos: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  estadoPostulacion: 'en_proceso' | 'completado' | 'rechazado';

  @ApiPropertyOptional()
  ciudad?: string;

  @ApiPropertyOptional()
  pais?: string;

  @ApiPropertyOptional()
  vacante?: string;

  @ApiProperty()
  tieneCV: boolean;

  @ApiPropertyOptional()
  versionCV?: number;

  /** Fecha de postulación (alta del registro de postulante). */
  @ApiProperty()
  creadoEn: Date;

  /** Última actividad (cualquier actualización del registro de postulante). */
  @ApiPropertyOptional()
  actualizadoEn?: Date;

  // Expediente / semáforo
  @ApiProperty({ enum: ['en_proceso', 'enviado'] })
  estadoExpediente: 'en_proceso' | 'enviado';

  @ApiProperty()
  porcentajeExpediente: number;

  @ApiProperty({ type: [String] })
  requisitosFaltantes: string[];

  @ApiProperty({ enum: ['verde', 'amarillo', 'rojo'] })
  semaforoClave: 'verde' | 'amarillo' | 'rojo';

  @ApiProperty()
  docsEvaluados: number;

  @ApiProperty()
  docsTotal: number;

  @ApiProperty({ enum: ['pendiente', 'en_evaluacion', 'evaluado'] })
  estadoEvaluacion: 'pendiente' | 'en_evaluacion' | 'evaluado';

  // ─── Eliminación (soft-delete / legado) ────────────────────────────────────

  @ApiProperty()
  eliminado: boolean;

  @ApiPropertyOptional({ enum: ['admin', 'self', 'desconocido'] })
  eliminadoOrigen?: 'admin' | 'self' | 'desconocido';

  @ApiPropertyOptional()
  eliminadoEn?: Date;

  @ApiPropertyOptional()
  eliminadoMotivo?: string;

  /** Solo se llena para ADMIN (ver EvaluacionesService#construirCandidatos). */
  @ApiPropertyOptional()
  eliminadoPorNombre?: string;

  @ApiPropertyOptional()
  eliminadoPorEmail?: string;
}

/** Conteos por estado general, sobre todos los candidatos que matchean q/vacante (sin paginar). */
export class ResumenCandidatosDto {
  @ApiProperty()
  incompleto: number;

  @ApiProperty()
  en_proceso: number;

  @ApiProperty()
  completo: number;

  @ApiProperty()
  enviado: number;

  @ApiProperty()
  evaluado: number;

  @ApiProperty()
  total: number;

  /** Candidatos eliminados que matchean q/vacante (para el contador del botón Papelera). Solo ADMIN. */
  @ApiPropertyOptional()
  eliminados?: number;
}

export class CandidatosPaginadosDto {
  @ApiProperty({ type: [CandidatoListaItemDto] })
  data: CandidatoListaItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  pages: number;
}

export class EvaluacionItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  documentoClave: string;

  @ApiProperty()
  comentario: string;

  @ApiPropertyOptional()
  calificacion?: number;

  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  estadoSugerido: 'en_proceso' | 'completado' | 'rechazado';

  @ApiPropertyOptional({ enum: ['APROBADO', 'RECHAZADO', 'EN_REVISION'] })
  resultadoEvaluacion?: 'APROBADO' | 'RECHAZADO' | 'EN_REVISION';

  @ApiPropertyOptional()
  fechaEvaluacion?: Date;

  @ApiProperty()
  evaluadorId: string;

  @ApiProperty()
  evaluadorNombre: string;

  @ApiProperty()
  creadoEn: Date;
}

export class EvaluacionDocumentoDto {
  @ApiProperty()
  documentoClave: string;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional({ type: EvaluacionItemDto })
  ultimaEvaluacion?: EvaluacionItemDto | null;

  @ApiProperty({ type: [EvaluacionItemDto] })
  historial: EvaluacionItemDto[];
}

export class EvaluacionGlobalItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  postulanteId: string;

  @ApiProperty()
  postulanteName: string;

  @ApiProperty()
  documentoClave: string;

  @ApiProperty()
  evaluadorId: string;

  @ApiProperty()
  evaluadorNombre: string;

  @ApiProperty()
  comentario: string;

  @ApiPropertyOptional()
  calificacion?: number;

  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  estadoSugerido: 'en_proceso' | 'completado' | 'rechazado';

  @ApiProperty()
  creadoEn: Date;
}

export class CandidatoDetalleDto {
  @ApiProperty()
  postulanteId: string;

  @ApiProperty()
  usuarioId: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellidos: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  telefono?: string;

  @ApiPropertyOptional()
  ciudad?: string;

  @ApiPropertyOptional()
  pais?: string;

  @ApiPropertyOptional()
  linkedinUrl?: string;

  @ApiPropertyOptional()
  vacante?: string;

  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  estadoPostulacion: 'en_proceso' | 'completado' | 'rechazado';

  @ApiProperty({ enum: ['en_proceso', 'enviado'] })
  estadoExpediente: 'en_proceso' | 'enviado';

  @ApiPropertyOptional()
  enviadoEn?: Date;

  @ApiProperty()
  porcentajeExpediente: number;

  @ApiProperty({ type: [String] })
  requisitosFaltantes: string[];

  @ApiProperty({ enum: ['verde', 'amarillo', 'rojo'] })
  semaforoClave: 'verde' | 'amarillo' | 'rojo';

  @ApiProperty()
  docsEvaluados: number;

  @ApiProperty()
  docsTotal: number;

  @ApiProperty({ enum: ['pendiente', 'en_evaluacion', 'evaluado'] })
  estadoEvaluacion: 'pendiente' | 'en_evaluacion' | 'evaluado';

  @ApiPropertyOptional()
  cvActual?: {
    id: string;
    nombreOriginal: string;
    tamanio: number;
    version: number;
    subidasEn: Date;
    tipoMime: string;
    urlDescargar?: string;
    urlVista?: string;
    storageType: 'local' | 'cloudinary';
  } | null;
}

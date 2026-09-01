import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidatoListaItemDto {
  @ApiProperty()
  postulanteId: string;

  @ApiProperty()
  nombreCompleto: string;

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
    urlDescargar?: string;
    storageType: 'local' | 'cloudinary';
  } | null;
}

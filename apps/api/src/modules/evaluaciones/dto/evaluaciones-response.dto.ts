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
}

export class EvaluacionItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  comentario: string;

  @ApiPropertyOptional()
  calificacion?: number;

  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  estadoSugerido: 'en_proceso' | 'completado' | 'rechazado';

  @ApiProperty()
  evaluadorId: string;

  @ApiProperty()
  evaluadorNombre: string;

  @ApiProperty()
  creadoEn: Date;
}

export class EvaluacionGlobalItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  postulanteId: string;

  @ApiProperty()
  postulanteName: string;

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

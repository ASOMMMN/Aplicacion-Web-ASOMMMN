import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import { ESTADOS_EXTRACCION, EstadoExtraccion } from '../ia/estado-extraccion';
import type { PrecisionFechas } from '../schemas/doc-personal.schema';

export class SubirDocPersonalDto {
  @ApiProperty({
    enum: TIPOS_DOC_PERSONAL,
    description: 'Tipo de documento personal',
    example: 'CURP',
  })
  @IsIn(TIPOS_DOC_PERSONAL)
  tipo: TipoDocPersonal;
}

export class DocPersonalResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  tipo: TipoDocPersonal;

  @ApiProperty()
  nombreOriginal: string;

  @ApiProperty()
  tamanio: number;

  @ApiProperty()
  tipoMime: string;

  @ApiProperty()
  subidasEn: Date;

  // ─────────────────────────────────────────────────────────────
  // Fechas extraídas mediante IA
  // ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Fecha de inicio de vigencia del documento, si fue identificada.',
    nullable: true,
    example: '2026-01-15',
  })
  fechaInicio?: Date;

  @ApiPropertyOptional({
    description:
      'Fecha de vencimiento o expiración del documento, si fue identificada.',
    nullable: true,
    example: '2031-01-15',
  })
  fechaVencimiento?: Date;

  @ApiPropertyOptional({
    description:
      'Fecha de emisión o expedición del documento, si fue identificada.',
    nullable: true,
    example: '2026-01-15',
  })
  fechaEmision?: Date;

  @ApiProperty({
    description:
      'Precisión de cada fecha según su texto: dia | mes | anio (ausente = dia).',
    example: { fechaEmision: 'anio', fechaVencimiento: 'anio' },
  })
  precisionFechas: PrecisionFechas;

  @ApiProperty({
    description:
      'La validación marcó alguna fecha para revisión (orden, duración, día/mes).',
  })
  revisarFechas: boolean;

  @ApiProperty({ type: [String] })
  motivosRevision: string[];

  @ApiPropertyOptional({
    description: 'El contenido no corresponde al tipo elegido.',
    nullable: true,
  })
  tipoSospechoso: { tipoElegido: string; tipoDetectado: string } | null;

  @ApiPropertyOptional({
    description: 'Último análisis con IA; ausente = nunca se analizó.',
  })
  analizadoEn?: Date;

  @ApiPropertyOptional({ description: 'Error del último análisis, si hubo.' })
  errorAnalisis?: string;

  @ApiProperty({
    enum: ESTADOS_EXTRACCION,
    description:
      'pendiente = nunca se analizó; ok; sin_fechas = se analizó y no hay fechas; error (ver extraccionError).',
  })
  extraccionEstado: EstadoExtraccion;

  @ApiPropertyOptional({ nullable: true, description: 'Motivo del error.' })
  extraccionError: string | null;

  @ApiProperty({
    description:
      'El evaluador corrigió las fechas a mano; la IA ya no las sobrescribe.',
  })
  fechasVerificadas: boolean;

  @ApiPropertyOptional({
    description:
      'Ausente si el archivo es de un almacenamiento anterior (storageType local)',
  })
  urlDescargar?: string;

  @ApiProperty({
    enum: ['local', 'cloudinary'],
    description:
      "'local' = archivo del almacenamiento anterior, ya no disponible; hay que volver a subirlo",
  })
  storageType: 'local' | 'cloudinary';
}

export class ResumenTipoDto {
  @ApiProperty()
  tipo: TipoDocPersonal;

  @ApiProperty()
  label: string;

  @ApiProperty()
  cantidad: number;

  @ApiProperty({ type: [DocPersonalResponseDto] })
  archivos: DocPersonalResponseDto[];
}

export class MisDocsResponseDto {
  @ApiPropertyOptional({ type: [ResumenTipoDto] })
  tipos: ResumenTipoDto[];

  @ApiProperty()
  totalArchivos: number;

  @ApiProperty()
  tiposConArchivos: number;
}

export class RenombrarDocPersonalDto {
  @ApiProperty({
    description: 'Nuevo nombre visible del archivo',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombreOriginal: string;
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Corrección manual (evaluador/admin). null o ausente = sin esa fecha. */
export class VerificarFechasDocPersonalDto {
  @ApiPropertyOptional({ example: '2024-03-15', nullable: true })
  @IsOptional()
  @Matches(SOLO_FECHA, { message: 'fechaEmision debe ser YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  fechaEmision?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @Matches(SOLO_FECHA, { message: 'fechaInicio debe ser YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  fechaInicio?: string | null;

  @ApiPropertyOptional({ example: '2026-03-14', nullable: true })
  @IsOptional()
  @Matches(SOLO_FECHA, { message: 'fechaVencimiento debe ser YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  fechaVencimiento?: string | null;
}

/** Resultado de analizar un documento (botones de la interfaz). */
export class ResultadoAnalisisDocDto {
  @ApiProperty()
  docId: string;

  @ApiProperty({ enum: TIPOS_DOC_PERSONAL })
  tipo: TipoDocPersonal;

  @ApiProperty()
  label: string;

  @ApiProperty()
  nombreOriginal: string;

  @ApiProperty({ enum: ESTADOS_EXTRACCION })
  extraccionEstado: EstadoExtraccion;

  @ApiPropertyOptional({ nullable: true })
  extraccionError: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2024-03-15' })
  fechaEmision: string | null;

  @ApiPropertyOptional({ nullable: true })
  fechaInicio: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-03-14' })
  fechaVencimiento: string | null;

  @ApiProperty()
  revisarFechas: boolean;

  @ApiProperty()
  fechasVerificadas: boolean;
}

/** Estado del análisis global en segundo plano (solo administrador). */
export class EstadoAnalisisGlobalDto {
  @ApiProperty({ description: 'Hay un análisis global corriendo.' })
  enCurso: boolean;

  @ApiProperty({
    description:
      'Documentos en estado pendiente o error (sin fechas verificadas) ahora mismo.',
  })
  pendientesAhora: number;

  @ApiProperty({ description: 'Documentos del último análisis (o el actual).' })
  total: number;

  @ApiProperty()
  procesados: number;

  @ApiProperty()
  correctos: number;

  @ApiProperty()
  sinFechas: number;

  @ApiProperty()
  errores: number;

  @ApiPropertyOptional({ nullable: true })
  iniciadoEn: Date | null;

  @ApiPropertyOptional({ nullable: true })
  iniciadoPor: string | null;

  @ApiPropertyOptional({ nullable: true })
  finalizadoEn: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Por qué terminó: completado, detenido por el usuario o error de credenciales/cuota.',
  })
  motivoFin: string | null;

  @ApiProperty({
    type: [ResultadoAnalisisDocDto],
    description: 'Últimos documentos procesados (más reciente primero).',
  })
  recientes: ResultadoAnalisisDocDto[];
}

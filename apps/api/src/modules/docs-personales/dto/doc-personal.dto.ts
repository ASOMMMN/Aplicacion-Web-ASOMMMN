import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PropuestaFechasResumen } from '../ia/cambios-analisis';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';
import type { MetaFechaResumen } from '../ia/meta-fechas-derivadas';

import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import { ESTADOS_EXTRACCION, EstadoExtraccion } from '../ia/estado-extraccion';
import type { PrecisionFechas } from '../schemas/doc-personal.schema';
import type {
  DocumentoDetectado,
  FuenteFechaResumen,
} from '../ia/combinar-fuentes';

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
    nullable: true,
    description:
      'Fechas que un reanálisis leyó distintas a las guardadas; no se aplican hasta que el evaluador las acepte.',
  })
  propuestaFechas?: PropuestaFechasResumen | null;

  @ApiPropertyOptional({
    description:
      'Por fecha: fuente (ia | manual | regla | cv), precisión, confianza 0–1, evidencia y si está bloqueada por una corrección manual.',
  })
  metaFechas?: Partial<
    Record<
      'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      MetaFechaResumen
    >
  >;

  @ApiPropertyOptional({
    description: 'Cambios de fechas: quién, cuándo, valor anterior → nuevo.',
  })
  historialFechas?: Array<{
    campo: string;
    anterior: { valor: string | null; precision: string } | null;
    nuevo: { valor: string | null; precision: string } | null;
    fuente: string;
    motivo: string;
    porEmail: string | null;
    en: string;
  }>;

  @ApiPropertyOptional({
    description:
      'Por fecha: de dónde salió (qr | texto | ia) y si una fuente determinista la confirma (coincidente). Ausente en documentos analizados antes o con fechas verificadas.',
    example: {
      fechaEmision: { fuente: 'qr', coincidente: true },
      fechaVencimiento: { fuente: 'texto', coincidente: false },
    },
  })
  fuentesFechas?: Partial<
    Record<
      'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      FuenteFechaResumen
    >
  >;

  @ApiPropertyOptional({
    description:
      'Solo si el archivo trae más de un documento: las fechas de cada uno; las oficiales son las del principal (vencimiento más reciente).',
  })
  documentosDetectados?: DocumentoDetectado[];

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

  @ApiPropertyOptional({
    description:
      'Precisión de cada fecha corregida (dia | mes | anio). Con "anio" el vencimiento se guarda al 31/12 y se muestra solo el año.',
    example: { fechaVencimiento: 'anio' },
  })
  @IsOptional()
  @IsObject()
  @ValidarPrecisiones()
  precisionFechas?: Partial<
    Record<
      'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      'dia' | 'mes' | 'anio'
    >
  >;
}

/** "Desbloquear y reanalizar": campos a desbloquear (vacío = todos). */
export class DesbloquearFechasDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: ['fechaEmision', 'fechaInicio', 'fechaVencimiento'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['fechaEmision', 'fechaInicio', 'fechaVencimiento'], { each: true })
  campos?: Array<'fechaEmision' | 'fechaInicio' | 'fechaVencimiento'>;
}

/** Solo campos de fecha conocidos y precisiones dia | mes | anio. */
function ValidarPrecisiones() {
  return ValidateBy({
    name: 'precisionesValidas',
    validator: {
      validate: (v: unknown) =>
        v === undefined ||
        (typeof v === 'object' &&
          v !== null &&
          Object.entries(v).every(
            ([k, p]) =>
              ['fechaEmision', 'fechaInicio', 'fechaVencimiento'].includes(k) &&
              ['dia', 'mes', 'anio'].includes(p as string),
          )),
      defaultMessage: () =>
        'precisionFechas solo admite fechaEmision/fechaInicio/fechaVencimiento con dia, mes o anio.',
    },
  });
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

  @ApiPropertyOptional({
    description:
      'No se pudo analizar ahora (p. ej. límite por minuto de OpenAI); el documento no cambió.',
  })
  aviso?: string;

  @ApiPropertyOptional({
    description:
      'OpenAI respondió límite por minuto tras los reintentos: reintentar más tarde.',
  })
  limitePorMinuto?: boolean;
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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'En pausa por límite por minuto de OpenAI: hasta cuándo y por qué. Continúa solo.',
  })
  pausa: { hasta: Date; motivo: string } | null;
}

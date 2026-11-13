import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  DECISIONES_EXPEDIENTE,
  TIPOS_NOTIFICACION_APP,
  type DecisionExpediente,
  type TipoNotificacionApp,
} from '../schemas/notificacion-app.schema';

export const LIMITE_NOTIFICACIONES_DEFAULT = 20;
export const LIMITE_NOTIFICACIONES_MAX = 50;
/** Avisos que trae cada grupo del día; el resto se pide con tipo + dia. */
export const MAX_AVISOS_POR_GRUPO = 20;

/** Día del calendario de México (America/Mexico_City), "AAAA-MM-DD". */
export const PATRON_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const aBooleano = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

/** Filtros comunes de "mis avisos": tipo y día. */
export class FiltroNotificacionesAppQueryDto {
  @ApiPropertyOptional({ enum: TIPOS_NOTIFICACION_APP })
  @IsOptional()
  @IsIn(TIPOS_NOTIFICACION_APP)
  tipo?: TipoNotificacionApp;

  @ApiPropertyOptional({
    example: '2026-11-11',
    description: 'Día en hora de México (AAAA-MM-DD)',
  })
  @IsOptional()
  @Matches(PATRON_DIA, { message: 'dia debe tener el formato AAAA-MM-DD' })
  dia?: string;
}

export class ListarNotificacionesAppQueryDto extends FiltroNotificacionesAppQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({
    default: LIMITE_NOTIFICACIONES_DEFAULT,
    minimum: 1,
    maximum: LIMITE_NOTIFICACIONES_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_NOTIFICACIONES_MAX)
  limite?: number;

  @ApiPropertyOptional({ description: 'Solo las que yo no he leído' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  soloNoLeidas?: boolean;

  @ApiPropertyOptional({
    enum: ['dia'],
    description:
      'dia: agrupa los avisos del mismo tipo y día; la paginación es por grupo',
  })
  @IsOptional()
  @IsIn(['dia'])
  agrupar?: 'dia';
}

export type OpcionesListarNotificacionesApp = Partial<
  Pick<
    ListarNotificacionesAppQueryDto,
    'pagina' | 'limite' | 'soloNoLeidas' | 'tipo' | 'dia' | 'agrupar'
  >
>;
export type FiltroNotificacionesApp = Pick<
  FiltroNotificacionesAppQueryDto,
  'tipo' | 'dia'
>;

export class NotificacionAppItemDto {
  @ApiProperty() _id: string;
  @ApiProperty({ enum: TIPOS_NOTIFICACION_APP }) tipo: TipoNotificacionApp;
  @ApiProperty() candidatoId: string;
  @ApiProperty() nombreCandidato: string;
  @ApiProperty({ example: 'Ana Pérez se registró como postulante.' })
  mensaje: string;
  @ApiProperty({ example: '/candidato/665f1c2a9b1e8a0012345678' })
  enlace: string;
  /** Fecha del aviso (en documento_subido, la de la última subida). */
  @ApiProperty() fecha: Date;
  /** Leída por el usuario que consulta (no por otros). */
  @ApiProperty() leida: boolean;
  /** Eventos que junta (documento_subido); 1 en los demás. */
  @ApiProperty({ example: 1 }) cantidad: number;
  @ApiPropertyOptional({ type: [String] }) documentos?: string[];
  @ApiPropertyOptional({ enum: DECISIONES_EXPEDIENTE })
  decision?: DecisionExpediente;
  @ApiPropertyOptional() actorNombre?: string;
  @ApiPropertyOptional({ description: 'candidato_inactivo' })
  diasInactivo?: number;
}

export class GrupoNotificacionesAppDto {
  @ApiProperty({ example: '2026-11-11|nuevo_candidato' }) clave: string;
  @ApiProperty({ enum: TIPOS_NOTIFICACION_APP }) tipo: TipoNotificacionApp;
  @ApiProperty({ example: '2026-11-11' }) dia: string;
  @ApiProperty({ description: 'Avisos del grupo' }) cantidad: number;
  @ApiProperty({ description: 'De esos, los que yo no he leído' })
  noLeidas: number;
  @ApiProperty({ example: '5 postulantes nuevos hoy' }) resumen: string;
  @ApiProperty() fecha: Date;
  @ApiProperty({ type: [NotificacionAppItemDto] })
  items: NotificacionAppItemDto[];
  @ApiProperty({
    description: `true si el grupo tiene más de ${MAX_AVISOS_POR_GRUPO} avisos (pedir con tipo + dia)`,
  })
  hayMas: boolean;
}

export class ListaNotificacionesAppDto {
  @ApiProperty({ type: [NotificacionAppItemDto] })
  items: NotificacionAppItemDto[];
  /** Avisos que cumplen el filtro. */
  @ApiProperty() total: number;
  /** Todas mis no leídas (sin filtro): el número de la insignia. */
  @ApiProperty() noLeidas: number;
  @ApiProperty() pagina: number;
  @ApiProperty() limite: number;
  @ApiPropertyOptional({ type: [GrupoNotificacionesAppDto] })
  grupos?: GrupoNotificacionesAppDto[];
  /** Con agrupar=dia: total de grupos (la paginación es por grupo). */
  @ApiPropertyOptional() totalGrupos?: number;
}

export class MarcarTodasAppDto {
  @ApiProperty() message: string;
  @ApiProperty() actualizadas: number;
}

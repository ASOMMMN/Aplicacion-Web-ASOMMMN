import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  TIPOS_NOTIFICACION_APP,
  type TipoNotificacionApp,
} from '../schemas/notificacion-app.schema';

export const LIMITE_NOTIFICACIONES_DEFAULT = 20;
export const LIMITE_NOTIFICACIONES_MAX = 50;

export class ListarNotificacionesAppQueryDto {
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
}

export class NotificacionAppItemDto {
  @ApiProperty() _id: string;
  @ApiProperty({ enum: TIPOS_NOTIFICACION_APP }) tipo: TipoNotificacionApp;
  @ApiProperty() candidatoId: string;
  @ApiProperty() nombreCandidato: string;
  @ApiProperty({ example: 'Ana Pérez se registró como postulante.' })
  mensaje: string;
  @ApiProperty({ example: '/candidato/665f1c2a9b1e8a0012345678' })
  enlace: string;
  @ApiProperty() fecha: Date;
  /** Leída por el usuario que consulta (no por otros). */
  @ApiProperty() leida: boolean;
}

export class ListaNotificacionesAppDto {
  @ApiProperty({ type: [NotificacionAppItemDto] })
  items: NotificacionAppItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() noLeidas: number;
  @ApiProperty() pagina: number;
  @ApiProperty() limite: number;
}

export class MarcarTodasAppDto {
  @ApiProperty() message: string;
  @ApiProperty() actualizadas: number;
}

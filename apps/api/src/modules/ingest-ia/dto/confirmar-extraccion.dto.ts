import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { DatosCV } from '../schemas/extraccion.schema';

export class ConfirmarExtraccionDto {
  @ApiPropertyOptional({ description: 'Datos revisados y editados por el evaluador' })
  @IsOptional()
  @IsObject()
  datosConfirmados?: DatosCV;
}

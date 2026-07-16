import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AccountStatus } from '../schemas/usuario.schema';

export class UpdateEstadoDto {
  @ApiProperty({ enum: ['activa', 'bloqueada'] })
  @IsEnum(['activa', 'bloqueada'], {
    message: "El estado debe ser 'activa' o 'bloqueada'",
  })
  estado: AccountStatus;
}

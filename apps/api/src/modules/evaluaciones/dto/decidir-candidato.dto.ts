import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class DecidirCandidatoDto {
  @ApiProperty({ enum: ['en_proceso', 'completado', 'rechazado'] })
  @IsIn(['en_proceso', 'completado', 'rechazado'])
  decision: 'en_proceso' | 'completado' | 'rechazado';
}

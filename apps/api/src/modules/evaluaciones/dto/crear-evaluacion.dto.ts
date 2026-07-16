import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CrearEvaluacionDto {
  @ApiProperty({ example: 'Buen perfil tecnico, mejorar comunicacion.' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  comentario: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number;

  @ApiPropertyOptional({
    enum: ['en_proceso', 'completado', 'rechazado'],
    default: 'en_proceso',
  })
  @IsOptional()
  @IsIn(['en_proceso', 'completado', 'rechazado'])
  estadoSugerido?: 'en_proceso' | 'completado' | 'rechazado';
}

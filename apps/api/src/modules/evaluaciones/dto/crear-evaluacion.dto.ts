import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CLAVES_REQUISITO } from '../../postulantes/constants/expediente.constants';

export class CrearEvaluacionDto {
  @ApiProperty({
    enum: CLAVES_REQUISITO,
    description: 'Documento del expediente que se está evaluando',
  })
  @IsIn(CLAVES_REQUISITO)
  documentoClave: string;

  @ApiPropertyOptional({
    example: 'Buen perfil tecnico, mejorar comunicacion.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number;

  @ApiProperty({ enum: ['APROBADO', 'RECHAZADO', 'EN_REVISION'] })
  @IsIn(['APROBADO', 'RECHAZADO', 'EN_REVISION'])
  resultadoEvaluacion: 'APROBADO' | 'RECHAZADO' | 'EN_REVISION';

  @ApiPropertyOptional({
    enum: ['en_proceso', 'completado', 'rechazado'],
    default: 'en_proceso',
  })
  @IsOptional()
  @IsIn(['en_proceso', 'completado', 'rechazado'])
  estadoSugerido?: 'en_proceso' | 'completado' | 'rechazado';
}

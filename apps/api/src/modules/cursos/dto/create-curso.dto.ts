import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCursoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  nombreCurso: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  institucion?: string;

  @IsDateString()
  fechaCurso: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  apareceEnCV: boolean;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;
}

export class RenombrarCursoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  nombreCurso: string;
}

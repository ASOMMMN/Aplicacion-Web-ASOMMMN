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

  /** Compatibilidad: si falta, el servidor usa inicio, emisión u hoy (México). */
  @IsOptional()
  @IsDateString()
  fechaCurso?: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  apareceEnCV: boolean;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  /** Fecha de expedición/emisión del certificado. */
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  /**
   * Solo si el documento trae vencimiento. Si falta y hay documento, el
   * servidor aplica la regla de 5 años (estimado).
   */
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

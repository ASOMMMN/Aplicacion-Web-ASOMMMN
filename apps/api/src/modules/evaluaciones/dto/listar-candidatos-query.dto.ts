import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ESTADOS_CANDIDATO = [
  'incompleto',
  'en_proceso',
  'completo',
  'enviado',
  'evaluado',
] as const;
export type EstadoCandidato = (typeof ESTADOS_CANDIDATO)[number];

export const CAMPOS_ORDENABLES_CANDIDATO = [
  'actualizadoEn',
  'creadoEn',
  'nombreCompleto',
  'porcentajeExpediente',
] as const;
export type CampoOrdenableCandidato =
  (typeof CAMPOS_ORDENABLES_CANDIDATO)[number];

/**
 * Filtros/paginación opcionales de GET /evaluaciones/candidatos. Sin
 * `ordenarPor`, el servicio usa su propio orden por defecto (enviados sin
 * evaluar primero, por fecha de envío ascendente).
 */
export class ListarCandidatosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 20;

  @IsOptional()
  @IsIn(CAMPOS_ORDENABLES_CANDIDATO)
  ordenarPor?: CampoOrdenableCandidato;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(ESTADOS_CANDIDATO)
  estado?: EstadoCandidato;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vacante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/** Filtros de GET /evaluaciones/candidatos/resumen (sin paginación ni orden). */
export class ResumenCandidatosQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vacante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
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
  'docsEvaluados',
  'estadoGeneral',
  'eliminadoEn',
] as const;
export type CampoOrdenableCandidato =
  (typeof CAMPOS_ORDENABLES_CANDIDATO)[number];

/**
 * 'activos' (default): excluye candidatos eliminados — se aplica del lado
 * del servidor, no es solo un filtro de UI. 'papelera': solo candidatos
 * eliminados; requiere rol administrador (ver
 * EvaluacionesService#resolverVista, lanza ForbiddenException si no).
 */
export const VISTAS_CANDIDATOS = ['activos', 'papelera'] as const;
export type VistaCandidatos = (typeof VISTAS_CANDIDATOS)[number];

export const ORIGENES_ELIMINACION = ['admin', 'self', 'desconocido'] as const;
export type OrigenEliminacionCandidato = (typeof ORIGENES_ELIMINACION)[number];

/** sin_avance=0%, parcial=1-99%, completo=100% de `porcentajeExpediente`. */
export const NIVELES_AVANCE = ['sin_avance', 'parcial', 'completo'] as const;
export type NivelAvance = (typeof NIVELES_AVANCE)[number];

/** ninguno=0 evaluados, parcial=0<evaluados<total, completo=evaluados===total. */
export const NIVELES_DOCS_EVALUADOS = [
  'ninguno',
  'parcial',
  'completo',
] as const;
export type NivelDocsEvaluados = (typeof NIVELES_DOCS_EVALUADOS)[number];

/** `?estado=completo,enviado` → ['completo','enviado']; un solo valor sin comas pasa igual. */
function aArray(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return value;
}

/**
 * Filtros compartidos por GET /evaluaciones/candidatos, /candidatos/resumen y
 * /candidatos/exportar — los 3 endpoints deben aceptar exactamente el mismo
 * set de filtros y resolverlos con la misma función pura (ver
 * utils/filtrar-ordenar-candidatos.util.ts).
 *
 * `estado`/`vacante` son multiselect: en el query string viajan como un solo
 * string separado por comas (`?estado=completo,enviado`); un valor sin comas
 * sigue siendo compatible con clientes que mandan un solo valor.
 */
export class FiltrosCandidatosDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => aArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  vacante?: string[];

  @IsOptional()
  @Transform(({ value }) => aArray(value))
  @IsArray()
  @IsIn(ESTADOS_CANDIDATO, { each: true })
  estado?: EstadoCandidato[];

  /** Rango inclusivo sobre `creadoEn` (o `eliminadoEn` si `vista=papelera`). */
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  /** Preset "Sin actividad X días": incluye solo candidatos cuya última actividad fue en o antes de esta fecha. */
  @IsOptional()
  @IsDateString()
  actividadAntesDe?: string;

  @IsOptional()
  @IsIn(NIVELES_AVANCE)
  avance?: NivelAvance;

  @IsOptional()
  @IsIn(NIVELES_DOCS_EVALUADOS)
  docs?: NivelDocsEvaluados;

  @IsOptional()
  @IsIn(VISTAS_CANDIDATOS)
  vista?: VistaCandidatos;

  @IsOptional()
  @IsIn(ORIGENES_ELIMINACION)
  origenEliminacion?: OrigenEliminacionCandidato;
}

/**
 * Filtros + paginación/orden de GET /evaluaciones/candidatos. Sin
 * `ordenarPor`, el servicio usa su propio orden por defecto (enviados sin
 * evaluar primero, por fecha de envío ascendente).
 */
export class ListarCandidatosQueryDto extends FiltrosCandidatosDto {
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

  /** 'eliminadoEn' solo es válido con `vista=papelera` (400 si no, ver EvaluacionesService). */
  @IsOptional()
  @IsIn(CAMPOS_ORDENABLES_CANDIDATO)
  ordenarPor?: CampoOrdenableCandidato;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc';
}

/** Filtros de GET /evaluaciones/candidatos/resumen (sin paginación ni orden). */
export class ResumenCandidatosQueryDto extends FiltrosCandidatosDto {}

/** Filtros de GET /evaluaciones/candidatos/exportar (sin paginación ni orden: exporta todo lo filtrado). */
export class ExportarCandidatosQueryDto extends FiltrosCandidatosDto {}

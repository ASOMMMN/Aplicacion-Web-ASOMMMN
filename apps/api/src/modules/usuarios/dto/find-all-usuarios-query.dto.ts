import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { UserRole } from '../schemas/usuario.schema';

const ROLES: UserRole[] = ['postulante', 'evaluador', 'administrador'];

export class FindAllUsuariosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(ROLES)
  rol?: UserRole;
}

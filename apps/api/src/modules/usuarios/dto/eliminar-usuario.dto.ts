import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EliminarUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

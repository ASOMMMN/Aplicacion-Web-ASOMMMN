import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AutoeliminarCuentaDto {
  @IsNotEmpty()
  @IsString()
  contrasenaActual: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

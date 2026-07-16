import {
  IsOptional,
  IsString,
  IsDateString,
  IsUrl,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePerfilDto {
  @ApiPropertyOptional({ example: '+34612345678' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: '1995-05-15' })
  @IsOptional()
  @IsDateString()
  fechaNacimiento?: Date;

  @ApiPropertyOptional({ example: 'Madrid' })
  @IsOptional()
  @IsString()
  ciudad?: string;

  @ApiPropertyOptional({ example: 'España' })
  @IsOptional()
  @IsString()
  pais?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/usuario' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 'Oficial de Puente' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La vacante no puede estar vacía' })
  @MaxLength(200)
  vacante?: string;
}

export class GetPerfilResponseDto {
  declare usuarioId: string;
  declare nombre: string;
  declare apellidos: string;
  declare email: string;
  telefono?: string;
  fechaNacimiento?: Date;
  ciudad?: string;
  pais?: string;
  linkedinUrl?: string;
  vacante?: string;
  declare estadoPostulacion: 'en_proceso' | 'completado' | 'rechazado';
  declare estadoExpediente: 'en_proceso' | 'enviado';
  enviadoEn?: Date;
  declare creadoEn: Date;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ContrasenaSegura } from '../../../common/validators/contrasena-segura';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'evaluador@asommmn.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  @ApiProperty({ example: 'Carlos' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nombre: string;

  @ApiProperty({ example: 'Martínez' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidos: string;

  @ApiProperty({ example: 'Gaviota-Norte-42' })
  @ContrasenaSegura()
  password: string;

  @ApiProperty({ enum: ['evaluador', 'administrador'] })
  @IsEnum(['evaluador', 'administrador'], {
    message: 'Solo se puede crear evaluadores o administradores desde aquí',
  })
  rol: 'evaluador' | 'administrador';
}

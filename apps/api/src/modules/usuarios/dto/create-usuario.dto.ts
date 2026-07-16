import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

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

  @ApiProperty({ example: 'TempPass1!' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Debe incluir mayúsculas, minúsculas y números',
  })
  password: string;

  @ApiProperty({ enum: ['evaluador', 'administrador'] })
  @IsEnum(['evaluador', 'administrador'], {
    message: 'Solo se puede crear evaluadores o administradores desde aquí',
  })
  rol: 'evaluador' | 'administrador';
}

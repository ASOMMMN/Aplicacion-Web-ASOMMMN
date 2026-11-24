import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ContrasenaSegura } from '../../../common/validators/contrasena-segura';

export class RegisterDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nombre: string;

  @ApiProperty({ example: 'García López' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidos: string;

  @ApiProperty({ example: 'Gaviota-Norte-42' })
  @ContrasenaSegura()
  password: string;
}

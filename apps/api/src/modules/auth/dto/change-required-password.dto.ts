import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangeRequiredPasswordDto {
  @ApiProperty({ example: 'usuario@asommmn.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  @ApiProperty({ example: 'Temp1234!' })
  @IsString()
  @IsNotEmpty()
  passwordTemporal: string;

  @ApiProperty({ example: 'NuevaContrasena123' })
  @IsString()
  @MinLength(10, { message: 'Mínimo 10 caracteres' })
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Debe incluir mayúsculas, minúsculas y números',
  })
  nuevaPassword: string;
}

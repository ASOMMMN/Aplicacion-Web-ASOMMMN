import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ContrasenaSegura } from '../../../common/validators/contrasena-segura';

export class ChangeRequiredPasswordDto {
  @ApiProperty({ example: 'usuario@asommmn.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  @ApiProperty({ example: 'Temp1234!' })
  @IsString()
  @IsNotEmpty()
  passwordTemporal: string;

  @ApiProperty({ example: 'Faro-Del-Sur-77' })
  @ContrasenaSegura()
  nuevaPassword: string;
}

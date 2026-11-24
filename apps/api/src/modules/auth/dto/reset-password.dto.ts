import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { ContrasenaSegura } from '../../../common/validators/contrasena-segura';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'Faro-Del-Sur-77' })
  @ContrasenaSegura()
  nuevaPassword: string;
}

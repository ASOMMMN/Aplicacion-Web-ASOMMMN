import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NuevaContrasena123' })
  @IsString()
  @MinLength(10, { message: 'Mínimo 10 caracteres' })
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Debe incluir mayúsculas, minúsculas y números',
  })
  nuevaPassword: string;
}

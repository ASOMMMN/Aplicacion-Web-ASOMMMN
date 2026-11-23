import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { TurnstileTokenOpcional } from '../../../common/turnstile/turnstile-token.decorator';

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  @ApiProperty({ example: 'Contrasena1!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  /** Token de Cloudflare Turnstile; lo exige TurnstileGuard. */
  @TurnstileTokenOpcional()
  turnstileToken?: string;
}

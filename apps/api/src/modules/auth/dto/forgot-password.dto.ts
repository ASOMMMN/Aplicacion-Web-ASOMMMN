import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { TurnstileTokenOpcional } from '../../../common/turnstile/turnstile-token.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email: string;

  /** Token de Cloudflare Turnstile; solo lo exige /auth/recuperar-contrasena
   * (el DTO también lo usa /auth/reenviar-verificacion). */
  @TurnstileTokenOpcional()
  turnstileToken?: string;
}

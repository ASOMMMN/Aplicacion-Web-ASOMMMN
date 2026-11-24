import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { AVISO_PRIVACIDAD_VERSION } from '../../privacidad/aviso-privacidad.constants';
import { PrivacyConsentInputDto } from '../../privacidad/dto/privacy-consent.dto';
import { TurnstileTokenOpcional } from '../../../common/turnstile/turnstile-token.decorator';

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

  @ApiProperty({ example: 'Contrasena1!' })
  @IsString()
  @MinLength(10, { message: 'Mínimo 10 caracteres' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Debe incluir mayúsculas, minúsculas y números',
  })
  password: string;

  /** Casilla obligatoria del aviso de privacidad (P-01). */
  @ApiProperty({
    type: PrivacyConsentInputDto,
    example: { accepted: true, version: AVISO_PRIVACIDAD_VERSION },
  })
  @IsDefined({ message: 'Debes aceptar el aviso de privacidad.' })
  @ValidateNested()
  @Type(() => PrivacyConsentInputDto)
  privacyConsent: PrivacyConsentInputDto;

  /** Token de Cloudflare Turnstile; lo exige TurnstileGuard. */
  @TurnstileTokenOpcional()
  turnstileToken?: string;
}

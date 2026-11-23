import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString } from 'class-validator';

import {
  AVISO_PRIVACIDAD_VERSION,
  MENSAJE_VERSION_AVISO,
} from '../aviso-privacidad.constants';

/**
 * Consentimiento que manda la web en el registro. La fecha y la IP las pone
 * el servidor (no se confía en las del cliente).
 */
export class PrivacyConsentInputDto {
  /** Casilla "He leído y acepto el Aviso de Privacidad". */
  @ApiProperty({ example: true })
  @IsBoolean({ message: 'Debes aceptar el aviso de privacidad.' })
  @Equals(true, { message: 'Debes aceptar el aviso de privacidad.' })
  accepted: boolean;

  /** Versión del aviso que se le mostró; debe ser la vigente. */
  @ApiProperty({ example: AVISO_PRIVACIDAD_VERSION })
  @IsString({ message: MENSAJE_VERSION_AVISO })
  @Equals(AVISO_PRIVACIDAD_VERSION, { message: MENSAJE_VERSION_AVISO })
  version: string;
}

/** POST /privacidad/consentimiento (usuarios existentes). */
export class AceptarConsentimientoDto {
  @ApiProperty({ example: AVISO_PRIVACIDAD_VERSION })
  @IsString({ message: MENSAJE_VERSION_AVISO })
  @Equals(AVISO_PRIVACIDAD_VERSION, { message: MENSAJE_VERSION_AVISO })
  version: string;
}

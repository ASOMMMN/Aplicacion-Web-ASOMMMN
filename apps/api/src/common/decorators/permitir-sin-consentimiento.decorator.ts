import { SetMetadata } from '@nestjs/common';

export const PERMITIR_SIN_CONSENTIMIENTO_KEY = 'permitirSinConsentimiento';

/**
 * La ruta responde aunque el postulante no haya aceptado el aviso de
 * privacidad vigente (p. ej. la propia ruta de aceptación). Sin este
 * decorador, RolesGuard responde 403 PRIVACY_CONSENT_REQUIRED.
 */
export const PermitirSinConsentimiento = () =>
  SetMetadata(PERMITIR_SIN_CONSENTIMIENTO_KEY, true);

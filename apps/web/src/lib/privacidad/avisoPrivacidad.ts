/**
 * Aviso de privacidad de la plataforma (P-01 en AUDITORIA.md).
 *
 * AVISO_PRIVACIDAD_VERSION debe ser idéntica a la de apps/api
 * (src/modules/privacidad/aviso-privacidad.constants.ts): el registro solo
 * acepta la versión vigente y, al cambiarla, los postulantes deben aceptar
 * el aviso nuevo en su siguiente inicio de sesión.
 */
export const AVISO_PRIVACIDAD_VERSION = '2026-11-v1';

/** Fecha de la última edición del texto (no es la fecha de vigencia). */
export const AVISO_PRIVACIDAD_ACTUALIZADO = '23 de noviembre de 2026';

export const RUTA_AVISO_PRIVACIDAD = '/aviso-de-privacidad';

/** Aviso general publicado en el sitio institucional. */
export const URL_AVISO_GENERAL_ASOMMMN = 'https://asommmn.org.mx/privacidad';

/** Código del 403 de la API mientras falta aceptar el aviso vigente. */
export const CODIGO_CONSENTIMIENTO_PENDIENTE = 'PRIVACY_CONSENT_REQUIRED';

/** Cuerpo `privacyConsent` del registro. */
export const consentimientoRegistro = () => ({
  accepted: true as const,
  version: AVISO_PRIVACIDAD_VERSION,
});

/**
 * Aviso de privacidad (P-01 en AUDITORIA.md, LFPDPPP).
 *
 * AVISO_PRIVACIDAD_VERSION debe ser idéntica a la de apps/web
 * (src/lib/privacidad/avisoPrivacidad.ts). Al publicar un aviso nuevo se
 * cambian las dos: el registro solo acepta la versión vigente y los
 * postulantes que aceptaron una anterior deben aceptar la nueva en su
 * siguiente inicio de sesión.
 */
export const AVISO_PRIVACIDAD_VERSION = '2026-11-v2';

/** Código del 403 que la web usa para mostrar el modal de aceptación. */
export const CODIGO_CONSENTIMIENTO_PENDIENTE = 'PRIVACY_CONSENT_REQUIRED';

export const MENSAJE_VERSION_AVISO =
  'La versión del aviso de privacidad no es la vigente. Recarga la página y vuelve a aceptarlo.';

/** Lo que se guarda en usuarios.privacyConsent. */
export interface PrivacyConsent {
  version: string;
  acceptedAt: Date;
  ip?: string;
}

/**
 * Solo los postulantes (titulares de los expedientes) deben aceptar el
 * aviso antes de usar la plataforma. Evaluadores y administradores son
 * personal de la asociación: no se les bloquea (ver PR).
 *
 * Cuentas existentes sin el campo, o con otra versión, cuentan como
 * pendientes; no hace falta migrar datos.
 */
export function requiereConsentimiento(usuario: {
  rol?: string;
  privacyConsent?: { version?: string } | null;
}): boolean {
  return (
    usuario.rol === 'postulante' &&
    usuario.privacyConsent?.version !== AVISO_PRIVACIDAD_VERSION
  );
}

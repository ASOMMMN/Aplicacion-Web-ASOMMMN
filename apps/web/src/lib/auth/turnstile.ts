/**
 * Cloudflare Turnstile (S-14 en AUDITORIA.md): configuración compartida por
 * el widget y los formularios de login, registro y recuperar contraseña.
 *
 * Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY (desarrollo local) queda apagado: no se
 * pinta el widget, no se exige token y no se manda `turnstileToken`.
 */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
export const turnstileActivo = TURNSTILE_SITE_KEY.length > 0;

/** render=explicit: el widget lo pinta el componente, no el script. */
export const URL_SCRIPT_TURNSTILE =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const MENSAJES_TURNSTILE = {
  expirado: 'La verificación de seguridad expiró. Espera a que se complete de nuevo.',
  error: 'No se pudo completar la verificación de seguridad. La estamos reintentando.',
  sinCargar:
    'No se pudo cargar la verificación de seguridad. Revisa tu conexión o desactiva bloqueadores y recarga la página.',
} as const;

/** El botón de enviar espera el token solo si Turnstile está activo. */
export const faltaTokenTurnstile = (token: string) => turnstileActivo && !token;

/** Campo `turnstileToken` para el body (nada si Turnstile está apagado). */
export function conTurnstile<T extends object>(
  body: T,
  token: string,
): T & { turnstileToken?: string } {
  return turnstileActivo && token ? { ...body, turnstileToken: token } : body;
}

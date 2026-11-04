/**
 * Lo que ve el usuario cuando falla la IA. Los mensajes del proveedor
 * (OpenAI: "429 You have no credits remaining…", códigos, enlaces de
 * facturación) se registran en el log del servidor pero nunca se devuelven:
 * se reemplazan por un texto genérico. Los mensajes propios en español
 * ("El PDF no contiene suficiente texto legible.") se conservan.
 */
export const MENSAJE_IA_GENERICO =
  'No se pudo extraer la información automáticamente, inténtalo más tarde.';

/** Sin punto final: la interfaz le agrega "Vuelve a intentarlo en un minuto." */
export const MENSAJE_IA_OCUPADO =
  'El servicio de IA está ocupado en este momento';

const PATRON_LIMITE = /l[íi]mite por minuto|rate[_ ]?limit/i;

const PATRON_PROVEEDOR =
  /openai|gpt-|insufficient_quota|quota|credits?\b|billing|factur|api[ _-]?key|https?:\/\/|\bHTTP \d{3}\b|^\s*\d{3}\b|sin saldo|tokens?\b/i;

/** Error de la extracción cuyo mensaje es propio y se puede mostrar tal cual. */
export class ErrorIaVisible extends Error {}

export function mensajeIaParaUsuario(interno: string): string;
export function mensajeIaParaUsuario(
  interno: string | null | undefined,
): string | undefined;
export function mensajeIaParaUsuario(
  interno: string | null | undefined,
): string | undefined {
  if (interno === null || interno === undefined) return undefined;
  if (!interno.trim()) return interno;
  if (PATRON_LIMITE.test(interno)) return MENSAJE_IA_OCUPADO;
  if (PATRON_PROVEEDOR.test(interno)) return MENSAJE_IA_GENERICO;
  return interno;
}

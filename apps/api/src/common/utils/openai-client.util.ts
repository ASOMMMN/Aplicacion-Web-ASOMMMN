import OpenAI from 'openai';

/**
 * Cliente de OpenAI que se puede construir aunque falte OPENAI_API_KEY.
 *
 * El SDK (v6) lanza "Missing credentials" en el constructor si la key está
 * vacía; como los servicios lo crean en su constructor, una key faltante
 * tumbaba el arranque completo de la API. Con la marca de abajo el cliente
 * se construye igual y cada llamador revisa la key antes de usarlo (si no
 * lo hiciera, OpenAI respondería 401).
 */
export const OPENAI_KEY_AUSENTE = 'OPENAI_API_KEY-no-configurada';

export function crearClienteOpenAI(apiKey: string | undefined): OpenAI {
  return new OpenAI({ apiKey: apiKey?.trim() || OPENAI_KEY_AUSENTE });
}

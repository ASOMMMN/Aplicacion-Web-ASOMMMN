/**
 * Errores y límites de OpenAI.
 *
 * Un HTTP 429 de OpenAI puede ser dos cosas muy distintas:
 * - code "insufficient_quota": la cuenta no tiene saldo. Reintentar no
 *   sirve; hay que recargar crédito.
 * - code "rate_limit_exceeded": se rebasó el límite por minuto de
 *   peticiones o de tokens (RPM/TPM). Basta con esperar y reintentar.
 */

export type TipoErrorOpenAI =
  | 'sin_saldo'
  | 'limite_por_minuto'
  | 'key_invalida'
  | 'otro';

export interface ErrorOpenAIClasificado {
  tipo: TipoErrorOpenAI;
  status: number;
  /** code de OpenAI ("insufficient_quota", "rate_limit_exceeded"…). */
  codigo: string | null;
  /** Espera sugerida por OpenAI (retry-after / retry-after-ms). */
  esperaMs: number | null;
  /** Mensaje para el usuario y para guardar en el documento. */
  mensaje: string;
  /** Mensaje técnico original. */
  detalle: string;
}

export const MENSAJE_SIN_SALDO = 'OpenAI sin saldo: recarga crédito';
export const MENSAJE_LIMITE_POR_MINUTO =
  'Límite por minuto de OpenAI: se reintentará';

type HeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

function leerHeader(h: HeadersLike, nombre: string): string | null {
  if (!h) return null;
  if (typeof (h as Headers).get === 'function')
    return (h as Headers).get(nombre);
  const v = (h as Record<string, string | string[] | undefined>)[nombre];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** retry-after-ms (ms), retry-after (segundos o fecha HTTP). */
export function esperaDeHeaders(
  h: HeadersLike,
  ahora = Date.now(),
): number | null {
  const ms = Number(leerHeader(h, 'retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const ra = leerHeader(h, 'retry-after');
  if (!ra) return null;
  const seg = Number(ra);
  if (Number.isFinite(seg) && seg >= 0) return seg * 1000;
  const fecha = Date.parse(ra);
  return Number.isNaN(fecha) ? null : Math.max(0, fecha - ahora);
}

/**
 * Clasifica un error del SDK de OpenAI (APIError: status, code, headers,
 * error) o de fetch directo (status + cuerpo JSON + headers).
 */
export function clasificarErrorOpenAI(err: unknown): ErrorOpenAIClasificado {
  const e = (err ?? {}) as {
    status?: number;
    statusCode?: number;
    code?: string | null;
    error?: { code?: string | null; type?: string | null } | null;
    headers?: HeadersLike;
    message?: string;
  };
  const status = e.status ?? e.statusCode ?? 0;
  const codigo = e.code ?? e.error?.code ?? e.error?.type ?? null;
  const detalle = (e.message ?? 'Error desconocido').slice(0, 300);
  const base = { status, codigo, detalle, esperaMs: null };

  if (codigo === 'insufficient_quota') {
    return {
      ...base,
      tipo: 'sin_saldo',
      mensaje: `${MENSAJE_SIN_SALDO} (insufficient_quota).`,
    };
  }
  if (status === 429) {
    return {
      ...base,
      tipo: 'limite_por_minuto',
      esperaMs: esperaDeHeaders(e.headers),
      mensaje: `${MENSAJE_LIMITE_POR_MINUTO} (${codigo ?? 'rate_limit_exceeded'}).`,
    };
  }
  if (status === 401) {
    return {
      ...base,
      tipo: 'key_invalida',
      mensaje: 'Error de OpenAI: API key inválida o revocada (HTTP 401).',
    };
  }
  return {
    ...base,
    tipo: 'otro',
    mensaje: `Error de OpenAI${status ? ` (HTTP ${status})` : ''}: ${detalle}`,
  };
}

export interface ConfigReintentos {
  /** Intentos totales ante límite por minuto (incluye el primero). */
  maxIntentos: number;
  esperaBaseMs: number;
  esperaMaxMs: number;
}

export const CONFIG_REINTENTOS_POR_DEFECTO: ConfigReintentos = {
  maxIntentos: 5,
  esperaBaseMs: 2000,
  esperaMaxMs: 60_000,
};

/** IA_OPENAI_MAX_INTENTOS, IA_OPENAI_ESPERA_BASE_MS, IA_OPENAI_ESPERA_MAX_MS. */
export function configReintentosDesdeEnv(
  leer: (clave: string) => string | undefined,
): ConfigReintentos {
  const num = (clave: string, porDefecto: number) => {
    const n = Number(leer(clave));
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };
  const d = CONFIG_REINTENTOS_POR_DEFECTO;
  return {
    maxIntentos: num('IA_OPENAI_MAX_INTENTOS', d.maxIntentos),
    esperaBaseMs: num('IA_OPENAI_ESPERA_BASE_MS', d.esperaBaseMs),
    esperaMaxMs: num('IA_OPENAI_ESPERA_MAX_MS', d.esperaMaxMs),
  };
}

/** Espera exponencial con variación aleatoria; respeta retry-after. */
export function calcularEspera(
  intento: number,
  cfg: ConfigReintentos,
  sugerida: number | null,
  azar: () => number = Math.random,
): number {
  if (sugerida !== null) return Math.min(cfg.esperaMaxMs, sugerida + 250);
  const exp = cfg.esperaBaseMs * 2 ** (intento - 1);
  return Math.min(cfg.esperaMaxMs, Math.round(exp * (0.8 + azar() * 0.4)));
}

const dormirPorDefecto = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ejecuta `fn`; ante límite por minuto espera y reintenta hasta
 * `maxIntentos`. Cualquier otro error (sin saldo, key inválida…) se
 * relanza de inmediato: reintentarlo no sirve.
 */
export async function conReintentosOpenAI<T>(
  fn: () => Promise<T>,
  cfg: ConfigReintentos,
  onEspera?: (
    e: ErrorOpenAIClasificado,
    esperaMs: number,
    intento: number,
  ) => void,
  dormir: (ms: number) => Promise<void> = dormirPorDefecto,
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const e = clasificarErrorOpenAI(err);
      if (e.tipo !== 'limite_por_minuto' || intento >= cfg.maxIntentos)
        throw err;
      const espera = calcularEspera(intento, cfg, e.esperaMs);
      onEspera?.(e, espera, intento);
      await dormir(espera);
    }
  }
}

// ── Tokens aproximados ──────────────────────────────────────────────────────

/**
 * Tokens de una imagen según la fórmula publicada por OpenAI:
 * detail "high" → se ajusta a 2048×2048, luego a 768 px de lado corto, y
 * cuenta base + tiles de 512 px; "low" → solo la base. gpt-4o-mini cobra
 * ~33× más tokens por imagen (2833 base + 5667 por tile) que gpt-4o
 * (85 + 170 por tile).
 */
export function tokensImagen(
  modelo: string,
  ancho: number,
  alto: number,
  detail: 'high' | 'low',
): number {
  const mini = /mini/i.test(modelo) && /4o/.test(modelo);
  const [base, porTile] = mini ? [2833, 5667] : [85, 170];
  if (detail === 'low') return base;
  let w = ancho;
  let h = alto;
  const e1 = Math.min(1, 2048 / Math.max(w, h));
  w *= e1;
  h *= e1;
  const e2 = Math.min(1, 768 / Math.min(w, h));
  w *= e2;
  h *= e2;
  return base + porTile * Math.ceil(w / 512) * Math.ceil(h / 512);
}

/** ~4 caracteres por token en español/inglés. */
export const tokensTexto = (texto: string) => Math.ceil(texto.length / 4);

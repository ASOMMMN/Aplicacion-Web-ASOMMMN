import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const URL_SITEVERIFY =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare responde en < 1 s; más que esto se trata como caída. */
export const TIMEOUT_SITEVERIFY_MS = 5_000;

/** Los tokens de Turnstile miden hasta 2048 caracteres. */
const LARGO_MAXIMO_TOKEN = 2048;

interface RespuestaSiteverify {
  success?: boolean;
  'error-codes'?: string[];
}

/**
 * Verificación de Cloudflare Turnstile en el backend (S-14 en AUDITORIA.md).
 *
 * - Con TURNSTILE_SECRET_KEY: cada token se valida en siteverify junto con
 *   la IP del cliente (req.ip, ya resuelta con trust proxy).
 * - Sin la variable y NODE_ENV !== 'production': desactivado (desarrollo y
 *   pruebas locales funcionan sin captcha).
 * - Sin la variable en producción: falla cerrado (todo intento se rechaza)
 *   y se registra un error al arrancar.
 * - Cloudflare caído, lento (> 5 s) o con respuesta inválida: falla cerrado.
 */
@Injectable()
export class TurnstileService implements OnModuleInit {
  private readonly logger = new Logger(TurnstileService.name);
  private secreto = '';
  private produccion = false;

  /** Inyectables en pruebas. */
  timeoutMs = TIMEOUT_SITEVERIFY_MS;
  fetchFn: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.secreto = (
      this.config.get<string>('TURNSTILE_SECRET_KEY') ?? ''
    ).trim();
    this.produccion = this.config.get<string>('NODE_ENV') === 'production';

    if (this.secreto) return;
    if (this.produccion) {
      this.logger.error(
        'TURNSTILE_SECRET_KEY no está definida en producción: login, registro y ' +
          'recuperación de contraseña RECHAZARÁN todas las peticiones hasta ' +
          'configurarla (Render → Environment).',
      );
    } else {
      this.logger.warn(
        'TURNSTILE_SECRET_KEY no está definida: captcha desactivado (solo desarrollo).',
      );
    }
  }

  /** true si la petición puede continuar. */
  async verificar(token: unknown, ip?: string): Promise<boolean> {
    if (!this.secreto) return !this.produccion;

    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > LARGO_MAXIMO_TOKEN
    ) {
      return false;
    }

    const cuerpo = new URLSearchParams({
      secret: this.secreto,
      response: token,
    });
    if (ip) cuerpo.set('remoteip', ip);

    try {
      const res = await this.fetchFn(URL_SITEVERIFY, {
        method: 'POST',
        body: cuerpo,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.error(`[turnstile] siteverify respondió ${res.status}`);
        return false;
      }
      const datos = (await res.json()) as RespuestaSiteverify;
      if (datos.success === true) return true;
      this.logger.warn(
        `[turnstile] token rechazado: ${(datos['error-codes'] ?? []).join(',') || 'sin código'}`,
      );
      return false;
    } catch (err) {
      this.logger.error(
        `[turnstile] no se pudo verificar con Cloudflare: ${(err as Error)?.message}`,
      );
      return false;
    }
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const URL_SITEVERIFY =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare responde en < 1 s; más que esto se trata como caída. */
export const TIMEOUT_SITEVERIFY_MS = 5_000;

/** Con TURNSTILE_BYPASS activo, como mucho un aviso por minuto. */
export const INTERVALO_AVISO_BYPASS_MS = 60_000;

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
 * - TURNSTILE_BYPASS=true (exactamente "true"): interruptor de emergencia.
 *   Deja pasar sin validar, registra un error al arrancar y una advertencia
 *   como mucho una vez por minuto mientras esté activo. Cualquier otro valor
 *   se ignora. Es temporal: se quita en cuanto se resuelve el problema.
 */
@Injectable()
export class TurnstileService implements OnModuleInit {
  private readonly logger = new Logger(TurnstileService.name);
  private secreto = '';
  private produccion = false;
  private bypass = false;
  private ultimoAvisoBypass: number | null = null;
  private omitidasDesdeAviso = 0;

  /** Inyectables en pruebas. */
  ahora: () => number = () => Date.now();
  timeoutMs = TIMEOUT_SITEVERIFY_MS;
  fetchFn: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.secreto = (
      this.config.get<string>('TURNSTILE_SECRET_KEY') ?? ''
    ).trim();
    this.produccion = this.config.get<string>('NODE_ENV') === 'production';
    // Solo el valor exacto "true": "TRUE", "1", " true", etc. no lo activan.
    this.bypass = this.config.get<string>('TURNSTILE_BYPASS') === 'true';

    if (this.bypass) {
      this.logger.error(
        'TURNSTILE_BYPASS=true: el captcha está DESACTIVADO en login, registro y ' +
          'recuperación de contraseña. Es un interruptor de emergencia: quita la ' +
          'variable en cuanto se resuelva el problema.',
      );
      return;
    }
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
    if (this.bypass) {
      this.avisarBypass();
      return true;
    }
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

  /**
   * Advertencia con límite de frecuencia: la primera petición sin validar y
   * después como mucho una por intervalo, con el conteo acumulado. Nunca
   * incluye el token ni la IP.
   */
  private avisarBypass(): void {
    this.omitidasDesdeAviso++;
    const ahora = this.ahora();
    if (
      this.ultimoAvisoBypass !== null &&
      ahora - this.ultimoAvisoBypass < INTERVALO_AVISO_BYPASS_MS
    ) {
      return;
    }
    this.logger.warn(
      `[turnstile] TURNSTILE_BYPASS activo: ${this.omitidasDesdeAviso} ` +
        'petición(es) sin validar captcha desde el último aviso.',
    );
    this.ultimoAvisoBypass = ahora;
    this.omitidasDesdeAviso = 0;
  }
}

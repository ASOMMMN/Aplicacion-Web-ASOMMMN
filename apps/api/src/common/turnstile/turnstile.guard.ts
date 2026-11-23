import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { TurnstileService } from './turnstile.service';

/** Genérico a propósito: no distingue token ausente, inválido o Cloudflare caído. */
export const MENSAJE_TURNSTILE =
  'No pudimos verificar que no eres un robot. Vuelve a intentarlo.';

/**
 * Exige un token válido de Turnstile en el body (`turnstileToken`).
 * Solo para POST /auth/registro, /auth/login y /auth/recuperar-contrasena;
 * nunca en /auth/refresh ni en rutas autenticadas.
 *
 * Los guards corren antes del ValidationPipe: aquí el body aún es el JSON
 * crudo. El throttler global corre antes que este guard, así que una ráfaga
 * se corta con 429 sin llegar a Cloudflare.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(private readonly turnstile: TurnstileService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const body = req.body as { turnstileToken?: unknown } | undefined;
    const ok = await this.turnstile.verificar(body?.turnstileToken, req.ip);
    if (!ok) throw new BadRequestException(MENSAJE_TURNSTILE);
    return true;
  }
}

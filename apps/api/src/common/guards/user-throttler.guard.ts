import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const MENSAJE_TOPE_IA = 'mensaje-tope-ia';

/** Mensaje del 429 para rutas donde "análisis con IA" no describe la acción. */
export const MensajeTopeIa = (mensaje: string) =>
  SetMetadata(MENSAJE_TOPE_IA, mensaje);

/**
 * Rate limiting por usuario autenticado para endpoints costosos (IA).
 *
 * El ThrottlerGuard global corre como APP_GUARD, antes que JwtAuthGuard,
 * así que solo puede limitar por IP. Este guard se aplica a nivel de método
 * (después de JwtAuthGuard) y usa el userId como tracker.
 *
 * Usa su propio throttler 'ia': el guard global solo itera 'default', por lo
 * que ignora los @Throttle({ ia: ... }) y no duplica el conteo por IP.
 *
 * Uso:
 *   @UseGuards(UserThrottlerGuard)
 *   @Throttle({ ia: { limit: 20, ttl: 3_600_000 } })
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    // Valores por defecto si el endpoint no define @Throttle({ ia: ... })
    this.throttlers = [{ name: 'ia', ttl: 3_600_000, limit: 20 }];
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    return userId ? `user:${userId}` : super.getTracker(req);
  }

  protected getErrorMessage(context: ExecutionContext): Promise<string> {
    return Promise.resolve(
      this.reflector.get<string | undefined>(
        MENSAJE_TOPE_IA,
        context.getHandler(),
      ) ??
        'Has alcanzado el límite de análisis con IA. Intenta de nuevo más tarde.',
    );
  }
}

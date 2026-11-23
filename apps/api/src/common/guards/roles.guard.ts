import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';
import { PERMITIR_SIN_CONSENTIMIENTO_KEY } from '../decorators/permitir-sin-consentimiento.decorator';
import { CODIGO_CONSENTIMIENTO_PENDIENTE } from '../../modules/privacidad/aviso-privacidad.constants';
import type { AuthUser } from '../../modules/auth/strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) return false;

    const allowed = required.includes(user.rol);
    if (!allowed)
      throw new ForbiddenException(
        `Rol '${user.rol}' no tiene acceso a este recurso`,
      );

    // P-01: un postulante que no ha aceptado el aviso de privacidad vigente
    // no puede usar el resto de la API; la web muestra el modal de
    // aceptación al recibir este código.
    const permitirSinConsentimiento = this.reflector.getAllAndOverride<
      boolean | undefined
    >(PERMITIR_SIN_CONSENTIMIENTO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (user.consentimientoPendiente && !permitirSinConsentimiento) {
      throw new ForbiddenException({
        statusCode: 403,
        codigo: CODIGO_CONSENTIMIENTO_PENDIENTE,
        message:
          'Antes de continuar debes leer y aceptar el Aviso de Privacidad.',
      });
    }

    return true;
  }
}

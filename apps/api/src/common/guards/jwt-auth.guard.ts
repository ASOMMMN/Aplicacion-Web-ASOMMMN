import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // TEMP DEBUG - eliminar después de diagnosticar el 401 post-migración a Render
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err || !user) {
      this.logger.warn(
        `[TEMP-DEBUG] JwtAuthGuard rechazó la petición: err=${
          err ? String(err) : 'null'
        }, info=${info ? String(info) : 'null'}`,
      );
      throw err || new UnauthorizedException();
    }
    return user;
  }
}

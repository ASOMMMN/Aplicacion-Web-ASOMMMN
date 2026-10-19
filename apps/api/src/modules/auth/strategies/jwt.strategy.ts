import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  Usuario,
  UsuarioDocument,
  UserRole,
} from '../../usuarios/schemas/usuario.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  userId: string;
  email: string;
  rol: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? '',
    });
  }

  /**
   * Se consulta la base en cada request (no solo el payload del token) para
   * que una cuenta eliminada (soft-delete) pierda acceso de inmediato, sin
   * tener que esperar a que expire el access token ya emitido.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usuarioModel
      .findById(payload.sub)
      .select('isDeleted')
      .lean();
    if (!user || user.isDeleted) {
      throw new UnauthorizedException('Acceso denegado.');
    }
    return { userId: payload.sub, email: payload.email, rol: payload.rol };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import {
  AVISO_PRIVACIDAD_VERSION,
  requiereConsentimiento,
} from './aviso-privacidad.constants';

@Injectable()
export class PrivacidadService {
  constructor(
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async estado(userId: string) {
    const user = await this.usuarioModel
      .findOne({ _id: userId, isDeleted: { $ne: true } })
      .select('rol privacyConsent')
      .lean();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return {
      versionVigente: AVISO_PRIVACIDAD_VERSION,
      versionAceptada: user.privacyConsent?.version ?? null,
      acceptedAt: user.privacyConsent?.acceptedAt ?? null,
      requiresPrivacyConsent: requiereConsentimiento(user),
    };
  }

  /** Registra (o renueva) la aceptación de la versión vigente. */
  async aceptar(actor: AuthUser, ip?: string) {
    const privacyConsent = {
      version: AVISO_PRIVACIDAD_VERSION,
      acceptedAt: new Date(),
      ip,
    };
    const user = await this.usuarioModel.findOneAndUpdate(
      { _id: actor.userId, isDeleted: { $ne: true } },
      { $set: { privacyConsent } },
      { returnDocument: 'after', projection: { _id: 1 } },
    );
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'privacidad.consentimiento_aceptado',
      recurso: 'usuario',
      recursoId: actor.userId,
      ipAddress: ip,
      metadata: { version: privacyConsent.version },
    });
    return {
      version: privacyConsent.version,
      acceptedAt: privacyConsent.acceptedAt,
    };
  }
}

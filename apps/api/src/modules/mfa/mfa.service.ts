import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcryptjs';
import { MFA } from './schemas/mfa.schema';
import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema';
import { verificarPasswordCompatible } from '../../common/utils/password.util';

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_SALT_ROUNDS = 10;

@Injectable()
export class MFAService {
  private readonly logger = new Logger(MFAService.name);

  constructor(
    @InjectModel(MFA.name) private mfaModel: Model<MFA>,
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
  ) {}

  /**
   * Verifica la contraseña real de la cuenta antes de permitir acciones
   * sensibles sobre MFA (desactivar, regenerar códigos de recuperación).
   */
  async verificarPasswordUsuario(
    usuarioId: string,
    plainPassword: string,
  ): Promise<boolean> {
    const user = await this.usuarioModel.findById(usuarioId);
    if (!user) return false;
    return verificarPasswordCompatible(plainPassword, user.passwordHash);
  }

  /**
   * Genera un nuevo secret TOTP y retorna datos para mostrar QR
   */
  async generateSecret(
    usuarioId: string,
    email: string,
  ): Promise<{
    secret: string;
    qrCodeUrl: string;
    manualEntryKey: string;
  }> {
    const secret = speakeasy.generateSecret({
      name: `Postulaciones (${email})`,
      issuer: 'Postulaciones',
      length: 32,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new Error('Failed to generate secret');
    }

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCodeUrl,
      manualEntryKey: secret.base32,
    };
  }

  /**
   * Verifica un código TOTP contra un secret
   */
  verifyToken(secret: string, token: string): boolean {
    try {
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2, // Permite 2 slots de tiempo de diferencia
      });
      return !!verified;
    } catch (error) {
      this.logger.warn(`TOTP verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Genera códigos de recuperación para MFA
   */
  generateRecoveryCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += RECOVERY_CODE_ALPHABET[crypto.randomInt(0, RECOVERY_CODE_ALPHABET.length)];
      }
      codes.push(code);
    }
    return codes;
  }

  /**
   * Enrolla MFA para un usuario - guarda el secret pero no lo activa aún
   */
  async enrollMFA(usuarioId: string, secret: string): Promise<MFA> {
    const objectId = new Types.ObjectId(usuarioId);

    // Elimina MFA anterior si existe
    await this.mfaModel.deleteOne({ usuarioId: objectId });

    // Crea nuevo registro inactivo
    const mfa = new this.mfaModel({
      usuarioId: objectId,
      secret,
      activo: false,
      codigosRecuperacion: [],
    });

    return mfa.save();
  }

  /**
   * Activa MFA después de verificar el código inicial
   */
  async activateMFA(usuarioId: string): Promise<MFA> {
    const objectId = new Types.ObjectId(usuarioId);

    const mfa = await this.mfaModel.findOneAndUpdate(
      { usuarioId: objectId },
      {
        activo: true,
        activadoEn: new Date(),
      },
      { new: true },
    );

    if (!mfa) {
      throw new Error('MFA record not found');
    }

    return mfa;
  }

  /**
   * Obtiene registro MFA de un usuario
   */
  async getMFA(usuarioId: string): Promise<MFA | null> {
    const objectId = new Types.ObjectId(usuarioId);
    return this.mfaModel.findOne({ usuarioId: objectId });
  }

  /**
   * Obtiene MFA por email (para búsqueda)
   */
  async getMFAByEmail(email: string): Promise<MFA | null> {
    // Este método requiere que Usuario esté poblado
    return this.mfaModel.findOne({}).populate({
      path: 'usuarioId',
      match: { email },
    });
  }

  /**
   * Genera códigos de recuperación para un usuario
   */
  async generateAndSaveRecoveryCodes(usuarioId: string): Promise<string[]> {
    const objectId = new Types.ObjectId(usuarioId);
    const codes = this.generateRecoveryCodes(10);
    const hashedCodes = await Promise.all(
      codes.map((code) => bcrypt.hash(code, RECOVERY_CODE_SALT_ROUNDS)),
    );

    await this.mfaModel.findOneAndUpdate(
      { usuarioId: objectId },
      {
        codigosRecuperacion: hashedCodes,
        generadosCodigosEn: new Date(),
      },
      { new: true },
    );

    // Los códigos en claro solo se devuelven una vez, al usuario, para que los guarde.
    return codes;
  }

  /**
   * Verifica y consume un código de recuperación
   */
  async useRecoveryCode(
    usuarioId: string,
    recoveryCode: string,
  ): Promise<boolean> {
    const objectId = new Types.ObjectId(usuarioId);

    const mfa = await this.mfaModel.findOne({ usuarioId: objectId });
    if (!mfa) {
      return false;
    }

    let matchIndex = -1;
    for (let i = 0; i < mfa.codigosRecuperacion.length; i++) {
      if (await bcrypt.compare(recoveryCode, mfa.codigosRecuperacion[i])) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex === -1) {
      return false;
    }

    // Elimina el código usado (de un solo uso)
    mfa.codigosRecuperacion.splice(matchIndex, 1);
    await mfa.save();

    return true;
  }

  /**
   * Desactiva MFA para un usuario
   */
  async disableMFA(usuarioId: string): Promise<MFA> {
    const objectId = new Types.ObjectId(usuarioId);

    const mfa = await this.mfaModel.findOneAndUpdate(
      { usuarioId: objectId },
      {
        activo: false,
        secret: '',
        codigosRecuperacion: [],
        generadosCodigosEn: null,
      },
      { new: true },
    );

    if (!mfa) {
      throw new Error('MFA record not found');
    }

    return mfa;
  }

  /**
   * Verifica si MFA está activo para un usuario
   */
  async isMFAActive(usuarioId: string): Promise<boolean> {
    const objectId = new Types.ObjectId(usuarioId);
    const mfa = await this.mfaModel.findOne({ usuarioId: objectId });
    return mfa?.activo || false;
  }

  /**
   * Obtiene cantidad de códigos de recuperación disponibles
   */
  async getRecoveryCodeCount(usuarioId: string): Promise<number> {
    const objectId = new Types.ObjectId(usuarioId);
    const mfa = await this.mfaModel.findOne({ usuarioId: objectId });
    return mfa?.codigosRecuperacion.length || 0;
  }
}

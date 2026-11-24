import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  hashPassword,
  esHashBcrypt,
  verificarPasswordCompatible,
  compararContraHashFicticio,
} from '../../common/utils/password.util';

import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import {
  OneTimeToken,
  OneTimeTokenDocument,
} from './schemas/one-time-token.schema';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  NotificacionesAppService,
  filtroDestinatariosApp,
} from '../notificaciones/notificaciones-app.service';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { MFAService } from '../mfa/mfa.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { ChangeRequiredPasswordDto } from './dto/change-required-password.dto';

/**
 * Resultado interno del registro. La respuesta HTTP es la misma en los dos
 * casos (sin enumeración de cuentas). `pendientes` son los correos y avisos
 * que siguen en segundo plano: la respuesta no los espera, para que el
 * tiempo tampoco delate cuál de los dos casos ocurrió.
 */
export interface ResultadoRegistro {
  resultado: 'creado' | 'existente';
  pendientes: Promise<void>;
}

type MfaTempPurpose = 'verify_login' | 'setup_mfa';

type MfaTempPayload = {
  userId: string;
  email: string;
  type: 'mfa_temp';
  purpose: MfaTempPurpose;
};

type LoginResult =
  | {
      requiresPasswordChange: true;
      requiresMfa: false;
      user: {
        id: string;
        email: string;
        rol: string;
        nombre: string;
        apellidos: string;
      };
      message: string;
    }
  | {
      requiresPasswordChange: false;
      requiresMfa: true;
      requiresMfaSetup: boolean;
      tempSessionToken: string;
      user: {
        id: string;
        email: string;
        rol: string;
        nombre: string;
        apellidos: string;
      };
      message: string;
    }
  | {
      requiresPasswordChange: false;
      requiresMfa: false;
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        rol: string;
        nombre: string;
        apellidos: string;
      };
    };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private emailVerificationRequired = false;

  constructor(
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(OneTimeToken.name)
    private oneTimeTokenModel: Model<OneTimeTokenDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private notificaciones: NotificacionesService,
    private mfaService: MFAService,
    private auditoria: AuditoriaService,
    @InjectModel(Postulante.name)
    private postulanteModel: Model<PostulanteDocument>,
    private notificacionesApp: NotificacionesAppService,
  ) {}

  async onModuleInit() {
    this.emailVerificationRequired =
      this.config.get<string>('EMAIL_VERIFICATION_REQUIRED', 'false') ===
      'true';

    if (!this.emailVerificationRequired) {
      const result = await this.usuarioModel.updateMany(
        { estadoCuenta: 'pendiente_verificacion' },
        {
          $set: {
            estadoCuenta: 'activa',
            emailVerificado: true,
            emailVerificadoEn: new Date(),
          },
        },
      );
      if (result.modifiedCount > 0) {
        this.logger.log(
          `Migración: ${result.modifiedCount} cuenta(s) pendiente(s) activadas (EMAIL_VERIFICATION_REQUIRED=false)`,
        );
      }
    }
  }

  // ─── Registro ────────────────────────────────────────────────────────────────

  /**
   * El registro responde igual exista o no el correo:
   * - Correo nuevo: crea la cuenta (activa, como hasta ahora) y le envía un
   *   correo de bienvenida.
   * - Correo ya registrado: no cambia nada y avisa al titular por correo.
   * En ambos casos se calcula el hash bcrypt y los correos y avisos van en
   * segundo plano, para que el tiempo de respuesta sea parecido.
   */
  async registrar(dto: RegisterDto): Promise<ResultadoRegistro> {
    const email = dto.email.toLowerCase();
    const passwordHash = await hashPassword(dto.password);
    const exists = await this.usuarioModel.findOne({
      email,
      isDeleted: { $ne: true },
    });
    if (exists) {
      return {
        resultado: 'existente',
        pendientes: this.enSegundoPlano('aviso de registro duplicado', () =>
          this.notificaciones.enviarAvisoRegistroDuplicado(
            exists.email,
            exists.nombre,
            this.urlFrontend('/login'),
            this.urlFrontend('/recuperar-contrasena'),
          ),
        ),
      };
    }

    let usuario: UsuarioDocument;
    try {
      // Sin verificación de correo (como hasta ahora): entra de inmediato.
      usuario = await this.usuarioModel.create({
        email,
        passwordHash,
        nombre: dto.nombre,
        apellidos: dto.apellidos,
        rol: 'postulante',
        estadoCuenta: 'activa',
        emailVerificado: true,
        emailVerificadoEn: new Date(),
      });
    } catch (err) {
      // Dos registros simultáneos con el mismo correo: el índice único
      // rechaza el segundo. Se responde igual que un correo ya registrado.
      if ((err as { code?: number })?.code === 11000) {
        return { resultado: 'existente', pendientes: Promise.resolve() };
      }
      throw err;
    }
    this.logger.log(
      `[registro] nuevo postulante: usuario ${String(usuario._id)}`,
    );

    return {
      resultado: 'creado',
      pendientes: this.enSegundoPlano(
        'bienvenida y aviso de nuevo candidato',
        () =>
          Promise.all([
            this.notificaciones.enviarBienvenidaPostulante(
              usuario.email,
              usuario.nombre,
              this.urlFrontend('/login'),
            ),
            this.notificarNuevoCandidato(usuario),
          ]),
      ),
    };
  }

  private urlFrontend(ruta: string): string {
    const base = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return `${base}${ruta}`;
  }

  /**
   * Corre `tarea` sin que la respuesta HTTP la espere. Nunca rechaza: los
   * errores se registran, porque la respuesta ya se envió.
   */
  private enSegundoPlano(
    etiqueta: string,
    tarea: () => Promise<unknown>,
  ): Promise<void> {
    return Promise.resolve()
      .then(tarea)
      .then(
        () => undefined,
        (err: unknown) => {
          this.logger.error(
            `[segundo plano] ${etiqueta}: ${(err as Error)?.message}`,
            (err as Error)?.stack,
          );
        },
      );
  }

  /**
   * Crea (o recupera) el perfil en `postulantes` del usuario recién
   * registrado y devuelve su _id, o null si falló (el error se registra).
   *
   * Postulante tiene `timestamps` (creadoEn/actualizadoEn): Mongoose ya pone
   * `$setOnInsert.creadoEn` y `$set.actualizadoEn` en cada upsert. Si aquí
   * también se mandan en `$setOnInsert`, MongoDB rechaza el update entero
   * (código 40, ConflictingUpdateOperators: "Updating the path
   * 'actualizadoEn' would create a conflict") y el aviso nunca se crea.
   * Por eso solo van los campos propios.
   */
  private async asegurarPerfilPostulante(
    usuario: UsuarioDocument,
  ): Promise<Types.ObjectId | null> {
    try {
      const postulante = await this.postulanteModel
        .findOneAndUpdate(
          { usuarioId: usuario._id },
          { $setOnInsert: { estadoPostulacion: 'en_proceso' } },
          { upsert: true, returnDocument: 'after', projection: { _id: 1 } },
        )
        .lean<{ _id: Types.ObjectId }>()
        .exec();
      if (!postulante) {
        this.logger.error(
          `[nuevo_candidato] usuario ${String(usuario._id)}: el upsert del perfil de postulante no devolvió documento; no se crea el aviso`,
        );
        return null;
      }
      return postulante._id;
    } catch (err) {
      const e = err as { code?: number; message?: string; stack?: string };
      this.logger.error(
        `[nuevo_candidato] usuario ${String(usuario._id)}: no se pudo crear el perfil de postulante (código ${e?.code ?? '-'}): ${e?.message}; no se crea el aviso`,
        e?.stack,
      );
      return null;
    }
  }

  private async notificarNuevoCandidato(
    usuario: UsuarioDocument,
  ): Promise<void> {
    const nombreCandidato = `${usuario.nombre} ${usuario.apellidos}`.trim();

    // Campanita de evaluadores y admins. El perfil de postulante se crea
    // aquí (antes nacía en su primera visita al portal, con los mismos
    // valores iniciales) para que el aviso enlace a /candidato/<id>.
    const postulanteId = await this.asegurarPerfilPostulante(usuario);
    if (postulanteId) {
      try {
        await this.notificacionesApp.notificarNuevoCandidato(
          postulanteId,
          nombreCandidato,
        );
      } catch (err) {
        // El detalle (destinatarios, insert) ya lo registró
        // NotificacionesAppService; aquí queda el contexto del registro.
        this.logger.error(
          `[nuevo_candidato] usuario ${String(usuario._id)}: no se creó el aviso de la campanita: ${(err as Error)?.message}`,
          (err as Error)?.stack,
        );
      }
    }

    // Correo desactivado por defecto (NOTIF_EMAIL_EVALUADORES=false).
    if (!this.notificaciones.avisosEvaluadorPorCorreo) return;
    try {
      const evaluadores = await this.usuarioModel
        .find(filtroDestinatariosApp())
        .select('email nombre')
        .lean();
      const frontendUrl = this.config.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );

      await Promise.all(
        evaluadores.map((evaluador) =>
          this.notificaciones.enviarNuevoCandidatoRegistrado(
            evaluador.email,
            evaluador.nombre,
            nombreCandidato,
            `${frontendUrl}/candidatos`,
          ),
        ),
      );
    } catch (err) {
      this.logger.error(
        `Error notificando a evaluadores de nuevo candidato: ${(err as Error).message}`,
      );
    }
  }

  private async enviarVerificacionEmail(user: UsuarioDocument): Promise<void> {
    // Eliminar tokens previos para este usuario
    await this.oneTimeTokenModel.deleteMany({
      userId: user._id,
      tipo: 'email_verification',
    });

    const { rawToken, tokenHash } = this.generarToken();
    await this.oneTimeTokenModel.create({
      userId: user._id,
      tokenHash,
      tipo: 'email_verification',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const url = `${frontendUrl}/verificar-email?token=${rawToken}`;
    await this.notificaciones.enviarVerificacionEmail(
      user.email,
      user.nombre,
      url,
    );
  }

  async reenviarVerificacion(email: string): Promise<void> {
    const user = await this.usuarioModel.findOne({
      email: email.toLowerCase(),
    });
    if (!user || user.emailVerificado) return; // sin revelar
    await this.enviarVerificacionEmail(user);
  }

  // ─── Verificación de email ───────────────────────────────────────────────────

  async verificarEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const doc = await this.oneTimeTokenModel.findOne({
      tokenHash,
      tipo: 'email_verification',
      usado: false,
      expiresAt: { $gt: new Date() },
    });

    if (!doc) throw new BadRequestException('Token inválido o expirado');

    await this.usuarioModel.findByIdAndUpdate(doc.userId, {
      emailVerificado: true,
      emailVerificadoEn: new Date(),
      estadoCuenta: 'activa',
    });

    await this.oneTimeTokenModel.findByIdAndUpdate(doc._id, { usado: true });
  }

  /**
   * (TESTING ONLY) Verificar email por email sin token
   */
  async verificarEmailPorEmail(email: string): Promise<void> {
    const user = await this.usuarioModel.findOne({
      email: email.toLowerCase(),
    });

    if (!user) throw new BadRequestException('Usuario no encontrado');

    await this.usuarioModel.findByIdAndUpdate(user._id, {
      emailVerificado: true,
      emailVerificadoEn: new Date(),
      estadoCuenta: 'activa',
    });
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<LoginResult> {
    const user = await this.usuarioModel.findOne({
      email: dto.email.toLowerCase(),
      isDeleted: { $ne: true },
    });

    // Sin cuenta se compara igual contra un hash ficticio: misma respuesta y
    // tiempo parecido exista o no el correo.
    if (!user) {
      await compararContraHashFicticio(dto.password);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const passwordOk = await verificarPasswordCompatible(
      dto.password,
      user.passwordHash,
    );
    if (!passwordOk)
      throw new UnauthorizedException('Credenciales incorrectas');

    // Solo con la contraseña correcta: antes este 403 revelaba a cualquiera
    // que la cuenta existía y estaba bloqueada.
    if (user.estadoCuenta === 'bloqueada')
      throw new ForbiddenException(
        'Cuenta bloqueada. Contacta al administrador.',
      );

    if (!esHashBcrypt(user.passwordHash)) {
      user.passwordHash = await hashPassword(dto.password);
      await user.save();
    }

    if (user.debeCambiarContrasena) {
      return {
        requiresPasswordChange: true,
        requiresMfa: false,
        message: 'Debes cambiar tu contraseña temporal para continuar.',
        user: {
          id: user._id.toString(),
          email: user.email,
          rol: user.rol,
          nombre: user.nombre,
          apellidos: user.apellidos,
        },
      };
    }

    // MFA deshabilitado temporalmente: login solo con usuario + contraseña.

    await this.usuarioModel.findByIdAndUpdate(user._id, {
      ultimoAcceso: new Date(),
    });

    await this.auditoria.registrar({
      actorId: user._id.toString(),
      actorEmail: user.email,
      accion: 'auth.login',
      recurso: 'usuario',
      recursoId: user._id.toString(),
      ipAddress: ip,
      metadata: { rol: user.rol, userAgent: userAgent.slice(0, 200) },
    });

    const accessToken = this.firmarAccessToken(user);
    const refreshToken = await this.crearRefreshToken(
      user._id.toString(),
      ip,
      userAgent,
    );

    return {
      requiresPasswordChange: false,
      requiresMfa: false,
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
        apellidos: user.apellidos,
      },
    };
  }

  private firmarAccessToken(user: UsuarioDocument): string {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      rol: user.rol,
    };
    return this.jwtService.sign(payload);
  }

  private async crearRefreshToken(
    userId: string,
    ip: string,
    userAgent: string,
  ): Promise<string> {
    const { rawToken, tokenHash } = this.generarToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(userId),
      tokenHash,
      expiresAt,
      userAgent: userAgent.slice(0, 250),
      ipAddress: ip,
    });

    return rawToken;
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  async rotarRefreshToken(
    oldRawToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; rol: string }> {
    const tokenHash = this.hashToken(oldRawToken);
    // Rotación atómica: buscar y eliminar en una sola operación. Con
    // findOne + deleteOne, dos refresh simultáneos con la misma cookie podían
    // leer el token antes del borrado y emitir dos sesiones; así solo uno gana
    // y el otro recibe 401.
    const doc = await this.refreshTokenModel.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: new Date() },
    });

    if (!doc)
      throw new UnauthorizedException(
        'Sesión expirada. Inicia sesión nuevamente.',
      );

    const user = await this.usuarioModel.findById(doc.userId);
    if (!user || user.estadoCuenta === 'bloqueada' || user.isDeleted)
      throw new UnauthorizedException('Acceso denegado.');

    const accessToken = this.firmarAccessToken(user);
    const refreshToken = await this.crearRefreshToken(
      user._id.toString(),
      ip,
      userAgent,
    );

    return { accessToken, refreshToken, rol: user.rol };
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.refreshTokenModel.deleteOne({ tokenHash });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });
  }

  // ─── Recuperación de contraseña ──────────────────────────────────────────────

  /**
   * Misma respuesta y tiempo parecido exista o no el correo: después de la
   * búsqueda, la creación del token y el correo van en segundo plano.
   * Devuelve esa tarea (para pruebas); el controlador no la espera.
   */
  async solicitarRecuperacion(
    email: string,
  ): Promise<{ pendientes: Promise<void> }> {
    const user = await this.usuarioModel.findOne({
      email: email.toLowerCase(),
      isDeleted: { $ne: true },
    });
    // No revelar si el correo existe
    if (!user || user.estadoCuenta === 'bloqueada') {
      return { pendientes: Promise.resolve() };
    }
    return {
      pendientes: this.enSegundoPlano('correo de recuperación', () =>
        this.enviarEnlaceRecuperacion(user),
      ),
    };
  }

  private async enviarEnlaceRecuperacion(user: UsuarioDocument) {
    // Eliminar tokens previos para este usuario
    await this.oneTimeTokenModel.deleteMany({
      userId: user._id,
      tipo: 'password_reset',
    });

    const { rawToken, tokenHash } = this.generarToken();
    await this.oneTimeTokenModel.create({
      userId: user._id,
      tokenHash,
      tipo: 'password_reset',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontendUrl}/restablecer-contrasena?token=${rawToken}`;

    await this.notificaciones.enviarResetPasswordEmail(
      user.email,
      user.nombre,
      resetUrl,
    );
  }

  async resetearPassword(
    rawToken: string,
    nuevaPassword: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const doc = await this.oneTimeTokenModel.findOne({
      tokenHash,
      tipo: 'password_reset',
      usado: false,
      expiresAt: { $gt: new Date() },
    });

    if (!doc) throw new BadRequestException('Token inválido o expirado');

    await this.usuarioModel.findByIdAndUpdate(doc.userId, {
      passwordHash: await hashPassword(nuevaPassword),
      debeCambiarContrasena: false,
    });

    await this.oneTimeTokenModel.findByIdAndUpdate(doc._id, { usado: true });

    // Revocar todas las sesiones (seguridad post-reset)
    await this.refreshTokenModel.deleteMany({ userId: doc.userId });
  }

  async cambiarContrasenaObligatoria(
    dto: ChangeRequiredPasswordDto,
  ): Promise<void> {
    const user = await this.usuarioModel.findOne({
      email: dto.email.toLowerCase(),
      isDeleted: { $ne: true },
    });

    // Es otro login: misma respuesta exista o no el correo.
    if (!user) {
      await compararContraHashFicticio(dto.passwordTemporal);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const temporalOk = await verificarPasswordCompatible(
      dto.passwordTemporal,
      user.passwordHash,
    );
    if (!temporalOk)
      throw new UnauthorizedException('Credenciales incorrectas');

    // Después de validar la contraseña: antes este 400 revelaba qué cuentas
    // existen sin conocer ninguna contraseña.
    if (!user.debeCambiarContrasena) {
      throw new BadRequestException(
        'La cuenta no requiere cambio obligatorio de contraseña.',
      );
    }

    user.passwordHash = await hashPassword(dto.nuevaPassword);
    user.debeCambiarContrasena = false;
    await user.save();

    await this.refreshTokenModel.deleteMany({ userId: user._id });
  }

  async iniciarSetupMfa(tempSessionToken: string): Promise<{
    qrCodeUrl: string;
    manualEntryKey: string;
    message: string;
  }> {
    const payload = this.verificarMfaTempToken(tempSessionToken);

    if (payload.purpose !== 'setup_mfa') {
      throw new ForbiddenException('La sesion temporal no permite setup MFA.');
    }

    const user = await this.usuarioModel.findById(payload.userId);
    if (!user) throw new UnauthorizedException('Sesion invalida.');

    const yaActivo = await this.mfaService.isMFAActive(user._id.toString());
    if (yaActivo) {
      throw new BadRequestException(
        'MFA ya esta configurado para este usuario.',
      );
    }

    const { secret, qrCodeUrl, manualEntryKey } =
      await this.mfaService.generateSecret(user._id.toString(), user.email);
    await this.mfaService.enrollMFA(user._id.toString(), secret);

    return {
      qrCodeUrl,
      manualEntryKey,
      message: 'Escanea el codigo QR y confirma con un codigo TOTP.',
    };
  }

  async activarSetupMfa(
    tempSessionToken: string,
    codigo: string,
    ip: string,
    userAgent: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    recoveryCodes: string[];
    user: {
      id: string;
      email: string;
      rol: string;
      nombre: string;
      apellidos: string;
    };
  }> {
    const payload = this.verificarMfaTempToken(tempSessionToken);

    if (payload.purpose !== 'setup_mfa') {
      throw new ForbiddenException(
        'La sesion temporal no permite activar MFA.',
      );
    }

    const user = await this.usuarioModel.findById(payload.userId);
    if (!user) throw new UnauthorizedException('Sesion invalida.');

    const mfa = await this.mfaService.getMFA(user._id.toString());
    if (!mfa) {
      throw new BadRequestException('Primero debes iniciar el setup MFA.');
    }

    if (!this.mfaService.verifyToken(mfa.secret, codigo)) {
      throw new UnauthorizedException('Codigo MFA invalido.');
    }

    await this.mfaService.activateMFA(user._id.toString());
    const recoveryCodes = await this.mfaService.generateAndSaveRecoveryCodes(
      user._id.toString(),
    );

    await this.usuarioModel.findByIdAndUpdate(user._id, {
      ultimoAcceso: new Date(),
    });

    const accessToken = this.firmarAccessToken(user);
    const refreshToken = await this.crearRefreshToken(
      user._id.toString(),
      ip,
      userAgent,
    );

    return {
      accessToken,
      refreshToken,
      recoveryCodes,
      user: {
        id: user._id.toString(),
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
        apellidos: user.apellidos,
      },
    };
  }

  async verificarMfaLogin(
    tempSessionToken: string,
    codigo?: string,
    codigoRecuperacion?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      rol: string;
      nombre: string;
      apellidos: string;
    };
  }> {
    const payload = this.verificarMfaTempToken(tempSessionToken);

    if (payload.purpose !== 'verify_login') {
      throw new ForbiddenException(
        'La sesion temporal no permite verificar login MFA.',
      );
    }

    if (!codigo && !codigoRecuperacion) {
      throw new BadRequestException(
        'Debes enviar codigo TOTP o codigo de recuperacion.',
      );
    }

    const user = await this.usuarioModel.findById(payload.userId);
    if (!user) throw new UnauthorizedException('Sesion invalida.');

    const mfa = await this.mfaService.getMFA(user._id.toString());
    if (!mfa || !mfa.activo) {
      throw new BadRequestException(
        'MFA no esta habilitado para este usuario.',
      );
    }

    let validado = false;
    if (codigo) {
      validado = this.mfaService.verifyToken(mfa.secret, codigo);
    }

    if (!validado && codigoRecuperacion) {
      validado = await this.mfaService.useRecoveryCode(
        user._id.toString(),
        codigoRecuperacion,
      );
    }

    if (!validado) {
      throw new UnauthorizedException('Codigo MFA o de recuperacion invalido.');
    }

    await this.usuarioModel.findByIdAndUpdate(user._id, {
      ultimoAcceso: new Date(),
    });

    const accessToken = this.firmarAccessToken(user);
    const refreshToken = await this.crearRefreshToken(
      user._id.toString(),
      ip ?? '',
      userAgent ?? '',
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
        apellidos: user.apellidos,
      },
    };
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────────

  private generarMfaTempToken(
    user: UsuarioDocument,
    purpose: MfaTempPurpose,
  ): string {
    const payload: MfaTempPayload = {
      userId: user._id.toString(),
      email: user.email,
      type: 'mfa_temp',
      purpose,
    };

    return this.jwtService.sign(payload, { expiresIn: '10m' });
  }

  private verificarMfaTempToken(tempSessionToken: string): MfaTempPayload {
    try {
      const payload = this.jwtService.verify<MfaTempPayload>(tempSessionToken);

      if (payload.type !== 'mfa_temp') {
        throw new UnauthorizedException('Sesion temporal MFA invalida.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException(
        'Sesion temporal MFA expirada o invalida.',
      );
    }
  }

  private generarToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';

import {
  Usuario,
  UsuarioDocument,
  UserRole,
  AccountStatus,
  DeletedByRole,
} from './schemas/usuario.schema';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../auth/schemas/refresh-token.schema';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  generarContrasenaTemporal,
  hashPassword,
  verificarPasswordCompatible,
} from '../../common/utils/password.util';

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    @InjectModel(Usuario.name) private usuarioModel: Model<UsuarioDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private config: ConfigService,
    private notificaciones: NotificacionesService,
    private auditoria: AuditoriaService,
  ) {}

  // ─── Seed admin inicial ──────────────────────────────────────────────────────

  async onModuleInit() {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (!adminEmail) return;

    const plainPassword =
      this.config.get<string>('ADMIN_PASSWORD') ?? 'Admin123!';
    const existe = await this.usuarioModel.findOne({ rol: 'administrador' });

    if (existe) return;

    await this.usuarioModel.create({
      email: adminEmail.toLowerCase(),
      passwordHash: await hashPassword(plainPassword),
      nombre: this.config.get<string>('ADMIN_NOMBRE') ?? 'Administrador',
      apellidos: this.config.get<string>('ADMIN_APELLIDOS') ?? 'Sistema',
      rol: 'administrador',
      estadoCuenta: 'activa',
      debeCambiarContrasena: false,
      emailVerificado: true,
      emailVerificadoEn: new Date(),
    });

    this.logger.log(`Seed: administrador creado → ${adminEmail}`);
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async findAll(options: { page: number; limit: number; rol?: UserRole }) {
    const { page, limit, rol } = options;
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (rol) filter.rol = rol;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.usuarioModel
        .find(filter)
        .select('-passwordHash')
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.usuarioModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.usuarioModel
      .findById(id)
      .select('-passwordHash')
      .lean();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async crearUsuario(dto: CreateUsuarioDto, createdById: string) {
    const existe = await this.usuarioModel.findOne({
      email: dto.email.toLowerCase(),
      isDeleted: { $ne: true },
    });
    if (existe) throw new ConflictException('El correo ya está registrado');

    const user = await this.usuarioModel.create({
      email: dto.email.toLowerCase(),
      passwordHash: await hashPassword(dto.password),
      nombre: dto.nombre,
      apellidos: dto.apellidos,
      rol: dto.rol,
      estadoCuenta: 'activa',
      debeCambiarContrasena: false,
      emailVerificado: true,
      emailVerificadoEn: new Date(),
      creadoPor: createdById,
    });

    // Notificar al nuevo evaluador/admin con su contraseña temporal
    await this.notificaciones.enviarBienvenidaEvaluador(
      user.email,
      user.nombre,
      dto.password,
    );

    const { passwordHash: _omit, ...result } = user.toObject();
    return result;
  }

  async cambiarEstado(id: string, estado: AccountStatus, actor?: AuthUser, ipAddress?: string) {
    const user = await this.usuarioModel.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.estadoCuenta = estado;
    await user.save();

    if (actor) {
      await this.auditoria.registrar({
        actorId: actor.userId,
        actorEmail: actor.email,
        accion: `usuarios.${estado === 'activa' ? 'activar' : 'bloquear'}`,
        recurso: 'usuario',
        recursoId: id,
        ipAddress,
        metadata: { objetivoEmail: user.email, estadoNuevo: estado },
      });
    }

    const { passwordHash: _omit, ...result } = user.toObject();
    return result;
  }

  /** Marca el documento como eliminado (soft-delete) e invalida sus sesiones. */
  private async aplicarEliminacion(
    user: UsuarioDocument,
    params: {
      deletedByUserId: string;
      deletedByRole: DeletedByRole;
      motivo?: string;
    },
  ): Promise<void> {
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = new Types.ObjectId(params.deletedByUserId);
    user.deletedByRole = params.deletedByRole;
    user.deletionReason = params.motivo;
    user.deletedSnapshot = {
      nombre: user.nombre,
      apellidos: user.apellidos,
      email: user.email,
    };
    await user.save();

    await this.refreshTokenModel.deleteMany({ userId: user._id });
  }

  async eliminarUsuario(
    id: string,
    actor: AuthUser,
    ipAddress?: string,
    motivo?: string,
  ) {
    const user = await this.usuarioModel.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.aplicarEliminacion(user, {
      deletedByUserId: actor.userId,
      deletedByRole: 'ADMIN',
      motivo,
    });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'usuarios.eliminar',
      recurso: 'usuario',
      recursoId: id,
      ipAddress,
      metadata: { objetivoEmail: user.email, objetivoRol: user.rol, motivo },
    });

    const { passwordHash: _omit, ...result } = user.toObject();
    return result;
  }

  /** Autoeliminación de cuenta por el propio postulante. Requiere su contraseña actual. */
  async autoeliminarCuenta(
    userId: string,
    dto: { contrasenaActual: string; motivo?: string },
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const user = await this.usuarioModel.findOne({
      _id: userId,
      isDeleted: { $ne: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const passwordValida = await verificarPasswordCompatible(
      dto.contrasenaActual,
      user.passwordHash,
    );
    if (!passwordValida) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    await this.aplicarEliminacion(user, {
      deletedByUserId: userId,
      deletedByRole: 'SELF',
      motivo: dto.motivo,
    });

    await this.auditoria.registrar({
      actorId: userId,
      actorEmail: user.email,
      accion: 'usuarios.autoeliminar',
      recurso: 'usuario',
      recursoId: userId,
      ipAddress,
      metadata: {
        objetivoEmail: user.email,
        objetivoRol: user.rol,
        motivo: dto.motivo,
      },
    });

    return { message: 'Tu cuenta fue eliminada correctamente.' };
  }

  async restablecerContrasenaPorAdmin(
    targetUserId: string,
    admin: AuthUser,
    ipAddress?: string,
  ) {
    const user = await this.usuarioModel.findOne({
      _id: targetUserId,
      isDeleted: { $ne: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const passwordTemporal = generarContrasenaTemporal(12);
    user.passwordHash = await hashPassword(passwordTemporal);
    user.debeCambiarContrasena = true;
    await user.save();

    await this.refreshTokenModel.deleteMany({
      userId: new Types.ObjectId(targetUserId),
    });

    await this.auditoria.registrar({
      actorId: admin.userId,
      actorEmail: admin.email,
      accion: 'usuarios.restablecer_contrasena',
      recurso: 'usuario',
      recursoId: targetUserId,
      ipAddress,
      metadata: {
        objetivoEmail: user.email,
        objetivoRol: user.rol,
      },
    });

    return {
      usuarioId: user._id.toString(),
      email: user.email,
      debeCambiarContrasena: true,
      passwordTemporal,
    };
  }
}

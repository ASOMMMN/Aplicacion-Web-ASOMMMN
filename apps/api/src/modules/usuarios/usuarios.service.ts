import {
  Injectable,
  ConflictException,
  NotFoundException,
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
} from './schemas/usuario.schema';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../auth/schemas/refresh-token.schema';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { generarContrasenaTemporal } from '../../common/utils/password.util';

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
      passwordHash: plainPassword,
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
    const filter: Record<string, unknown> = rol ? { rol } : {};
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
    });
    if (existe) throw new ConflictException('El correo ya está registrado');

    const user = await this.usuarioModel.create({
      email: dto.email.toLowerCase(),
      passwordHash: dto.password,
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
    const user = await this.usuarioModel
      .findByIdAndUpdate(id, { estadoCuenta: estado }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('Usuario no encontrado');

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

    return user;
  }

  async restablecerContrasenaPorAdmin(
    targetUserId: string,
    admin: AuthUser,
    ipAddress?: string,
  ) {
    const user = await this.usuarioModel.findById(targetUserId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const passwordTemporal = generarContrasenaTemporal(12);
    user.passwordHash = passwordTemporal;
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

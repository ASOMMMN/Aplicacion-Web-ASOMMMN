import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { StorageService } from '../storage/storage.service';
import { Postulante, PostulanteDocument } from './schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { UpdatePerfilDto, GetPerfilResponseDto } from './dto/update-perfil.dto';
import { ExpedienteProgressDto } from './dto/expediente.dto';
import {
  REQUISITOS_EXPEDIENTE,
  resolverEstadoExpediente,
} from './constants/expediente.constants';
import {
  DocPersonal,
  DocPersonalDocument,
} from '../docs-personales/schemas/doc-personal.schema';
import {
  Documento,
  DocumentoDocument,
} from '../documentos/schemas/documento.schema';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import {
  CrearCarpetaDto,
  SubirDocumentoNubeDto,
  RenombrarNubeItemDto,
  CambiarCategoriaNubeItemDto,
  MoverNubeItemDto,
  NubeItemResponseDto,
  NubeListadoResponseDto,
} from './dto/nube.dto';
import {
  NubeItem,
  NubeItemDocument,
  NubeItemCategoria,
} from './schemas/nube-item.schema';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

@Injectable()
export class PostulantesService {
  private readonly logger = new Logger(PostulantesService.name);
  private readonly NUBE_CATEGORY = 'postulantes-nube';

  constructor(
    @InjectModel(Postulante.name)
    private postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private usuarioModel: Model<UsuarioDocument>,
    @InjectModel(NubeItem.name)
    private nubeItemModel: Model<NubeItemDocument>,
    @InjectModel(DocPersonal.name)
    private docPersonalModel: Model<DocPersonalDocument>,
    @InjectModel(Documento.name)
    private documentoModel: Model<DocumentoDocument>,
    private readonly auditoriaService: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Obtener o crear perfil del postulante autenticado
   */
  async obtenerPerfil(userId: string): Promise<GetPerfilResponseDto> {
    const usuario = await this.usuarioModel.findById(userId).lean();
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    let postulante = await this.postulanteModel
      .findOne({ usuarioId: new Types.ObjectId(userId) })
      .lean();

    // Si no existe, crear uno nuevo
    if (!postulante) {
      postulante = await this.postulanteModel.create({
        usuarioId: new Types.ObjectId(userId),
        estadoPostulacion: 'en_proceso',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });
    }

    // Reutiliza calcularProgreso para que estadoExpediente/enviadoEn reflejen
    // (y persistan) la misma corrección de consistencia que /mi-expediente.
    const progreso = await this.calcularProgreso(userId);

    return {
      usuarioId: usuario._id.toString(),
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      email: usuario.email,
      telefono: postulante.telefono,
      fechaNacimiento: postulante.fechaNacimiento,
      ciudad: postulante.ciudad,
      pais: postulante.pais,
      linkedinUrl: postulante.linkedinUrl,
      vacante: postulante.vacante,
      estadoPostulacion: postulante.estadoPostulacion,
      estadoExpediente: progreso.estadoExpediente,
      enviadoEn: progreso.enviadoEn,
      creadoEn: usuario.creadoEn,
    };
  }

  /**
   * Actualizar perfil del postulante
   */
  async actualizarPerfil(
    userId: string,
    dto: UpdatePerfilDto,
  ): Promise<GetPerfilResponseDto> {
    // Obtener o crear postulante
    let postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });

    if (!postulante) {
      postulante = await this.postulanteModel.create({
        usuarioId: new Types.ObjectId(userId),
        estadoPostulacion: 'en_proceso',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });
    }

    // Validaciones
    if (dto.fechaNacimiento) {
      const birthDate = new Date(dto.fechaNacimiento);
      const age = new Date().getFullYear() - birthDate.getFullYear();
      if (age < 18) {
        throw new BadRequestException('Debes tener al menos 18 años');
      }
    }

    // Actualizar
    Object.assign(postulante, {
      ...dto,
      actualizadoEn: new Date(),
    });

    await postulante.save();

    // Retornar perfil completo
    return this.obtenerPerfil(userId);
  }

  /**
   * Obtener perfil de un postulante (admin/evaluador)
   */
  async obtenerPerfilPor(postulanteId: string): Promise<GetPerfilResponseDto> {
    const postulante = await this.postulanteModel
      .findById(postulanteId)
      .populate('usuarioId', 'nombre apellidos email creadoEn')
      .lean();

    if (!postulante) throw new NotFoundException('Postulante no encontrado');

    const usuario = postulante.usuarioId as unknown as {
      _id: Types.ObjectId;
      nombre: string;
      apellidos: string;
      email: string;
      creadoEn: Date;
    };

    // Reutiliza calcularProgreso para que estadoExpediente/enviadoEn reflejen
    // (y persistan) la misma corrección de consistencia que /mi-expediente.
    const progreso = await this.calcularProgreso(usuario._id.toString());

    return {
      usuarioId: usuario._id.toString(),
      nombre: usuario.nombre,
      apellidos: usuario.apellidos,
      email: usuario.email,
      telefono: postulante.telefono,
      fechaNacimiento: postulante.fechaNacimiento,
      ciudad: postulante.ciudad,
      pais: postulante.pais,
      linkedinUrl: postulante.linkedinUrl,
      vacante: postulante.vacante,
      estadoPostulacion: postulante.estadoPostulacion,
      estadoExpediente: progreso.estadoExpediente,
      enviadoEn: progreso.enviadoEn,
      creadoEn: usuario.creadoEn,
    };
  }

  /**
   * Obtener postulante por ID de usuario (para busqueda)
   */
  async obtenerPostulantePorUserId(
    userId: string,
  ): Promise<PostulanteDocument | null> {
    return this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });
  }

  async listarMiNube(
    userId: string,
    parentId?: string,
    categoria?: NubeItemCategoria,
  ): Promise<NubeListadoResponseDto> {
    const postulante = await this.obtenerOCrearPostulante(userId);
    const filtro: Record<string, unknown> = {
      postulanteId: postulante._id,
      parentId: parentId ? new Types.ObjectId(parentId) : null,
    };
    if (categoria) filtro.categoria = categoria;

    const items = await this.nubeItemModel
      .find(filtro)
      .sort({ tipo: -1, nombre: 1 })
      .lean();

    return {
      parentId: parentId ?? null,
      items: items.map((item) => this.toNubeItemDto(item)),
    };
  }

  async listarNubePorPostulante(
    postulanteId: string,
  ): Promise<NubeListadoResponseDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('Postulante inválido.');
    }

    const items = await this.nubeItemModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .sort({ tipo: -1, nombre: 1 })
      .lean();

    return {
      parentId: null,
      items: items.map((item) => this.toNubeItemDto(item)),
    };
  }

  async crearCarpetaNube(
    userId: string,
    dto: CrearCarpetaDto,
  ): Promise<NubeItemResponseDto> {
    const postulante = await this.obtenerOCrearPostulante(userId);
    const parentId = await this.validarCarpetaPadre(
      postulante._id,
      dto.parentId,
    );

    const carpeta = await this.nubeItemModel.create({
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(userId),
      parentId,
      nombre: dto.nombre.trim(),
      tipo: 'carpeta',
      categoria: dto.categoria ?? 'otro',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    return this.toNubeItemDto(carpeta.toObject());
  }

  async subirDocumentoNube(
    userId: string,
    dto: SubirDocumentoNubeDto,
    file?: Express.Multer.File,
  ): Promise<NubeItemResponseDto> {
    if (!file) throw new BadRequestException('No se envió archivo.');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Solo se aceptan archivos PDF.');
    }

    const categoria = dto.categoria ?? 'otro';
    if (
      (categoria === 'curso' || categoria === 'certificacion') &&
      dto.apareceEnCV === false &&
      !file
    ) {
      throw new BadRequestException(
        'Si el curso/certificación no aparece en tu CV, el PDF es obligatorio.',
      );
    }

    const postulante = await this.obtenerOCrearPostulante(userId);
    const parentId = await this.validarCarpetaPadre(
      postulante._id,
      dto.parentId,
    );

    const nombreBase = (
      dto.nombre?.trim() ||
      file.originalname ||
      'documento.pdf'
    ).trim();
    const nombreArchivo = this.ensurePdfName(nombreBase);
    const usuario = await this.usuarioModel
      .findById(userId)
      .select('nombre apellidos')
      .lean();
    const carpeta =
      construirCarpetaPorNombre(usuario?.nombre, usuario?.apellidos) ?? userId;
    const key = `${carpeta}/${Date.now()}-${randomUUID()}-${this.sanitizeFileName(nombreArchivo)}`;

    const { url, key: s3Key } = await this.storage.putObject(
      this.NUBE_CATEGORY,
      key,
      file.buffer,
    );

    const item = await this.nubeItemModel.create({
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(userId),
      parentId,
      nombre: nombreArchivo,
      tipo: 'archivo',
      categoria,
      mimeType: file.mimetype,
      tamanio: file.size,
      storagePath: `${this.NUBE_CATEGORY}/${key}`,
      cloudinaryUrl: url,
      cloudinaryPublicId: s3Key,
      storageType: 'cloudinary',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    return this.toNubeItemDto(item.toObject());
  }

  async renombrarItemNube(
    userId: string,
    itemId: string,
    dto: RenombrarNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    const item = await this.getOwnedNubeItem(userId, itemId);
    item.nombre = dto.nombre.trim();
    await item.save();
    return this.toNubeItemDto(item.toObject());
  }

  async moverItemNube(
    userId: string,
    itemId: string,
    dto: MoverNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    const item = await this.getOwnedNubeItem(userId, itemId);
    const parentId = await this.validarCarpetaPadre(
      item.postulanteId,
      dto.parentId,
    );

    if (parentId && item._id.equals(parentId)) {
      throw new BadRequestException(
        'No puedes mover un item dentro de sí mismo.',
      );
    }

    item.parentId = parentId;
    await item.save();
    return this.toNubeItemDto(item.toObject());
  }

  async cambiarCategoriaItemNube(
    userId: string,
    itemId: string,
    dto: CambiarCategoriaNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    const item = await this.getOwnedNubeItem(userId, itemId);
    item.categoria = dto.categoria;
    await item.save();
    return this.toNubeItemDto(item.toObject());
  }

  async eliminarItemNube(
    userId: string,
    itemId: string,
  ): Promise<{ message: string }> {
    const item = await this.getOwnedNubeItem(userId, itemId);

    const idsAEliminar: Types.ObjectId[] = [item._id];
    if (item.tipo === 'carpeta') {
      const cola: Types.ObjectId[] = [item._id];
      while (cola.length > 0) {
        const actual = cola.shift() as Types.ObjectId;
        const hijos = await this.nubeItemModel
          .find({ postulanteId: item.postulanteId, parentId: actual })
          .select('_id tipo')
          .lean();
        for (const hijo of hijos) {
          const hijoId = new Types.ObjectId(String(hijo._id));
          idsAEliminar.push(hijoId);
          if (hijo.tipo === 'carpeta') cola.push(hijoId);
        }
      }
    }

    const items = await this.nubeItemModel
      .find({ _id: { $in: idsAEliminar }, tipo: 'archivo' })
      .select('storageType cloudinaryPublicId')
      .lean();

    for (const archivo of items) {
      if (archivo.storageType === 'cloudinary' && archivo.cloudinaryPublicId) {
        await this.storage.removeObject(archivo.cloudinaryPublicId);
      }
    }

    await this.nubeItemModel.deleteMany({ _id: { $in: idsAEliminar } });

    return { message: 'Item eliminado correctamente.' };
  }

  async resolverDescargaNube(
    userId: string,
    itemId: string,
  ): Promise<{ url: string; nombre: string }> {
    const item = await this.getOwnedNubeItem(userId, itemId);
    return this.resolverDescargaPorItem(item);
  }

  async resolverDescargaNubeEvaluador(
    postulanteId: string,
    itemId: string,
  ): Promise<{ url: string; nombre: string }> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('Postulante inválido.');
    }
    const item = await this.nubeItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      postulanteId: new Types.ObjectId(postulanteId),
    });

    if (!item) throw new NotFoundException('Documento no encontrado.');
    return this.resolverDescargaPorItem(item);
  }

  private resolverDescargaPorItem(
    item: Pick<
      NubeItem,
      'tipo' | 'storagePath' | 'nombre' | 'cloudinaryUrl' | 'storageType'
    >,
  ): { url: string; nombre: string } {
    if (item.tipo !== 'archivo' || !item.storagePath) {
      throw new BadRequestException('Solo los archivos se pueden descargar.');
    }
    if (item.storageType !== 'cloudinary' || !item.cloudinaryUrl) {
      throw new NotFoundException(
        'Este archivo es de un almacenamiento anterior y ya no está disponible. Debe volver a subirse.',
      );
    }

    return {
      url: item.cloudinaryUrl,
      nombre: item.nombre,
    };
  }

  private async getOwnedNubeItem(
    userId: string,
    itemId: string,
  ): Promise<NubeItemDocument> {
    if (!Types.ObjectId.isValid(itemId)) {
      throw new BadRequestException('ID de item inválido.');
    }

    const postulante = await this.obtenerOCrearPostulante(userId);
    const item = await this.nubeItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(userId),
    });
    if (!item) throw new NotFoundException('Item no encontrado.');
    return item;
  }

  private async validarCarpetaPadre(
    postulanteId: Types.ObjectId,
    parentId?: string,
  ): Promise<Types.ObjectId | null> {
    if (!parentId) return null;
    if (!Types.ObjectId.isValid(parentId)) {
      throw new BadRequestException('Carpeta padre inválida.');
    }

    const carpeta = await this.nubeItemModel.findOne({
      _id: new Types.ObjectId(parentId),
      postulanteId,
      tipo: 'carpeta',
    });

    if (!carpeta) {
      throw new NotFoundException('Carpeta padre no encontrada.');
    }

    return carpeta._id;
  }

  private toNubeItemDto(item: any): NubeItemResponseDto {
    const esCloudinario =
      item.storageType === 'cloudinary' && !!item.cloudinaryUrl;
    return {
      id: String(item._id),
      nombre: item.nombre,
      tipo: item.tipo,
      categoria: item.categoria,
      parentId: item.parentId ? String(item.parentId) : null,
      mimeType: item.mimeType,
      tamanio: item.tamanio,
      creadoEn: item.creadoEn,
      actualizadoEn: item.actualizadoEn,
      storageType:
        item.tipo === 'archivo'
          ? esCloudinario
            ? 'cloudinary'
            : 'local'
          : undefined,
      downloadUrl:
        item.tipo === 'archivo' && esCloudinario
          ? `/postulantes/mi-nube/${String(item._id)}/descargar`
          : undefined,
    };
  }

  private sanitizeFileName(nombre: string): string {
    return nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private ensurePdfName(nombre: string): string {
    const limpio = nombre.trim() || 'documento';
    return extname(limpio).toLowerCase() === '.pdf' ? limpio : `${limpio}.pdf`;
  }

  private async obtenerOCrearPostulante(
    userId: string,
  ): Promise<PostulanteDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Usuario autenticado inválido.');
    }

    const usuarioId = new Types.ObjectId(userId);
    let postulante = await this.postulanteModel.findOne({ usuarioId });
    if (postulante) return postulante;

    this.logger.warn(
      `Perfil de postulante no encontrado para usuario ${userId}. Creando perfil automático.`,
    );

    postulante = await this.postulanteModel.create({
      usuarioId,
      estadoPostulacion: 'en_proceso',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

    return postulante;
  }

  // ── Expediente ──────────────────────────────────────────────────────────────

  async calcularProgreso(userId: string): Promise<ExpedienteProgressDto> {
    const postulante = await this.postulanteModel
      .findOne({ usuarioId: new Types.ObjectId(userId) })
      .lean();

    const postulanteId = postulante?._id;

    const [tieneCV, tiposDP] = await Promise.all([
      postulanteId
        ? this.documentoModel.exists({ postulanteId, esActual: true })
        : Promise.resolve(null),
      postulanteId
        ? this.docPersonalModel.distinct('tipo', { postulanteId })
        : Promise.resolve([] as string[]),
    ]);

    const cumplidos = new Set<string>(tiposDP);
    if (tieneCV) cumplidos.add('cv');
    if (postulante?.vacante?.trim()) cumplidos.add('vacante');

    const requisitos = REQUISITOS_EXPEDIENTE.map((r) => ({
      clave: r.clave,
      label: r.label,
      urlFrontend: r.urlFrontend,
      cumplido: cumplidos.has(r.clave),
      requerido: r.requerido,
    }));

    // Los requisitos opcionales (ej. vacuna de fiebre amarilla) no cuentan
    // para el % de avance ni bloquean el envío del expediente.
    const requeridos = requisitos.filter((r) => r.requerido);
    const total = requeridos.length;
    const cumplidosCount = requeridos.filter((r) => r.cumplido).length;
    const porcentaje = Math.round((cumplidosCount / total) * 100);
    const estadoGuardado = postulante?.estadoExpediente ?? 'en_proceso';
    const estadoExpediente = resolverEstadoExpediente(
      porcentaje,
      estadoGuardado,
    );

    let enviadoEn = postulante?.enviadoEn;
    if (estadoExpediente !== estadoGuardado && postulanteId) {
      enviadoEn = undefined;
      await this.postulanteModel.updateOne(
        { _id: postulanteId },
        { $set: { estadoExpediente: 'en_proceso' }, $unset: { enviadoEn: '' } },
      );
    }

    return {
      porcentaje,
      total,
      cumplidos: cumplidosCount,
      requisitos,
      estadoExpediente,
      puedeEnviar: cumplidosCount === total && estadoExpediente !== 'enviado',
      enviadoEn,
    };
  }

  async finalizarPostulacion(
    userId: string,
    actor: AuthUser,
  ): Promise<ExpedienteProgressDto> {
    const progreso = await this.calcularProgreso(userId);

    if (progreso.porcentaje < 100) {
      const faltantes = progreso.requisitos
        .filter((r) => !r.cumplido)
        .map((r) => r.label)
        .join(', ');
      throw new BadRequestException(
        `El expediente no está completo. Falta: ${faltantes}`,
      );
    }

    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });
    if (!postulante)
      throw new NotFoundException('Perfil de postulante no encontrado');

    if (postulante.estadoExpediente === 'enviado') {
      throw new BadRequestException(
        'El expediente ya fue enviado anteriormente.',
      );
    }

    postulante.estadoExpediente = 'enviado';
    postulante.enviadoEn = new Date();
    await postulante.save();

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: actor.email,
      accion: 'expediente_enviado',
      recurso: 'Postulante',
      recursoId: String(postulante._id),
      metadata: { vacante: postulante.vacante ?? '' },
    });

    await this.notificarExpedienteEnviado(userId, postulante._id);

    return {
      ...progreso,
      estadoExpediente: 'enviado',
      puedeEnviar: false,
      enviadoEn: postulante.enviadoEn,
    };
  }

  private async notificarExpedienteEnviado(
    userId: string,
    postulanteId: Types.ObjectId,
  ): Promise<void> {
    const usuario = await this.usuarioModel
      .findById(userId)
      .select('nombre apellidos email')
      .lean();
    if (!usuario) return;

    try {
      await this.notificaciones.enviarConfirmacionExpedienteEnviado(
        usuario.email,
        usuario.nombre,
      );
    } catch (err) {
      this.logger.error(
        `Error enviando confirmación de expediente a ${usuario.email}: ${(err as Error).message}`,
      );
    }

    try {
      const evaluadores = await this.usuarioModel
        .find({ rol: { $in: ['evaluador', 'administrador'] } })
        .select('email nombre')
        .lean();
      const frontendUrl = this.config.get(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const candidatoUrl = `${frontendUrl}/candidato/${postulanteId}`;
      const nombreCandidato = `${usuario.nombre} ${usuario.apellidos}`.trim();

      await Promise.all(
        evaluadores.map((evaluador) =>
          this.notificaciones.enviarExpedienteListoRevisar(
            evaluador.email,
            evaluador.nombre,
            nombreCandidato,
            candidatoUrl,
          ),
        ),
      );
    } catch (err) {
      this.logger.error(
        `Error notificando a evaluadores sobre expediente completo: ${(err as Error).message}`,
      );
    }
  }

  @Cron('0 9 * * 1', {
    name: 'recordatorio-semanal-expediente',
    timeZone: 'America/Mexico_City',
  })
  async recordatorioSemanalCron(): Promise<void> {
    const { enviados } = await this.enviarRecordatoriosSemanales();
    this.logger.log(
      `Recordatorio semanal de expediente: ${enviados} correo(s) enviado(s).`,
    );
  }

  async enviarRecordatoriosSemanales(): Promise<{ enviados: number }> {
    const usuarios = await this.usuarioModel
      .find({ rol: 'postulante', estadoCuenta: 'activa' })
      .select('_id nombre email')
      .lean();

    let enviados = 0;
    for (const usuario of usuarios) {
      const progreso = await this.calcularProgreso(String(usuario._id));
      if (
        progreso.estadoExpediente === 'enviado' ||
        progreso.porcentaje >= 100
      ) {
        continue;
      }

      const faltantes = progreso.requisitos
        .filter((r) => !r.cumplido)
        .map((r) => r.label);

      try {
        await this.notificaciones.enviarRecordatorioDocumentosPendientes(
          usuario.email,
          usuario.nombre,
          faltantes,
        );
        enviados += 1;
      } catch (err) {
        this.logger.error(
          `Error enviando recordatorio semanal a ${usuario.email}: ${(err as Error).message}`,
        );
      }
    }

    return { enviados };
  }
}

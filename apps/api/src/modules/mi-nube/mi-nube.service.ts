import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Model, Types } from 'mongoose';

import {
  DocumentoNube,
  DocumentoNubeDocument,
  DocumentoNubeTipo,
} from './schemas/documento-nube.schema';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';

const NUBE_CATEGORY = 'mi-nube';

type DocumentoNubeLean = {
  _id: unknown;
  nombre?: string;
  tipo?: DocumentoNubeTipo;
  parentId?: Types.ObjectId | null;
  ownerId?: Types.ObjectId | null;
  storageKey?: string | null;
  mimeType?: string | null;
  size?: number;
  extension?: string | null;
  isDeleted?: boolean;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class MiNubeService {
  constructor(
    @InjectModel(DocumentoNube.name)
    private readonly documentoModel: Model<DocumentoNubeDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly storage: StorageService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(actor: AuthUser, parentId?: string | null) {
    const ownerId = this.getOwnerId(actor);
    const parentObjId = await this.parseParentId(parentId, ownerId);

    const items = await this.documentoModel
      .find({ ownerId, parentId: parentObjId, isDeleted: false })
      .sort({ tipo: -1, nombre: 1 })
      .lean();

    return {
      parentId: parentObjId?.toString() ?? null,
      items: await this.mapItems(items),
    };
  }

  async buscar(actor: AuthUser, q = '') {
    const ownerId = this.getOwnerId(actor);
    const term = q.trim();
    if (term.length < 2) return [];

    const items = await this.documentoModel
      .find({
        ownerId,
        isDeleted: false,
        nombre: { $regex: this.escapeRegex(term), $options: 'i' },
      })
      .sort({ tipo: -1, nombre: 1 })
      .limit(50)
      .lean();

    return this.mapItems(items);
  }

  async crearCarpeta(
    actor: AuthUser,
    nombre: string,
    parentId?: string | null,
  ) {
    const ownerId = this.getOwnerId(actor);
    const parentObjId = await this.parseParentId(parentId, ownerId);
    const nombreSeguro = this.sanitizarNombre(nombre);
    await this.validarNombreDisponible(ownerId, parentObjId, nombreSeguro);

    const doc = await this.documentoModel.create({
      nombre: nombreSeguro,
      tipo: 'folder',
      parentId: parentObjId,
      ownerId,
      storageKey: null,
      mimeType: null,
      size: 0,
      extension: null,
      isDeleted: false,
      createdBy: this.toObjectId(actor.userId),
      updatedBy: null,
    });

    await this.registrarAuditoria(actor, 'mi_nube_carpeta_crear', doc._id, {
      nombre: nombreSeguro,
      parentId: parentObjId?.toString() ?? null,
    });

    return (await this.mapItems([doc.toObject()]))[0];
  }

  async subirArchivo(
    actor: AuthUser,
    parentId: string | undefined,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido.');
    const ownerId = this.getOwnerId(actor);
    const parentObjId = await this.parseParentId(parentId, ownerId);
    const nombreSeguro = this.sanitizarNombre(file.originalname);
    await this.validarNombreDisponible(ownerId, parentObjId, nombreSeguro);

    const extension = this.obtenerExtension(nombreSeguro);
    const storageKey = this.crearStorageKey(
      ownerId.toString(),
      nombreSeguro,
      extension,
    );

    await this.storage.putObject(
      NUBE_CATEGORY,
      storageKey,
      file.buffer,
      file.mimetype,
    );

    const doc = await this.documentoModel.create({
      nombre: nombreSeguro,
      tipo: 'file',
      parentId: parentObjId,
      ownerId,
      storageKey,
      mimeType: file.mimetype || null,
      size: file.size,
      extension,
      isDeleted: false,
      createdBy: this.toObjectId(actor.userId),
      updatedBy: null,
    });

    await this.registrarAuditoria(actor, 'mi_nube_archivo_subir', doc._id, {
      nombre: nombreSeguro,
      parentId: parentObjId?.toString() ?? null,
      size: file.size,
      mimeType: file.mimetype,
    });

    return (await this.mapItems([doc.toObject()]))[0];
  }

  async obtenerArchivo(actor: AuthUser, id: string) {
    const doc = await this.obtenerDocumentoActivo(actor, id);
    if (doc.tipo !== 'file' || !doc.storageKey) {
      throw new BadRequestException('Solo los archivos pueden abrirse.');
    }

    return {
      buffer: await this.storage.getObject(NUBE_CATEGORY, doc.storageKey),
      nombre: doc.nombre,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      size: doc.size,
    };
  }

  async renombrar(actor: AuthUser, id: string, nombre: string) {
    const doc = await this.obtenerDocumentoActivo(actor, id);
    const nombreSeguro = this.sanitizarNombre(nombre);
    await this.validarNombreDisponible(
      doc.ownerId,
      doc.parentId,
      nombreSeguro,
      doc._id,
    );

    const nombreAnterior = doc.nombre;
    doc.nombre = nombreSeguro;
    doc.extension =
      doc.tipo === 'file' ? this.obtenerExtension(nombreSeguro) : null;
    doc.updatedBy = this.toObjectId(actor.userId);
    await doc.save();

    await this.registrarAuditoria(actor, 'mi_nube_renombrar', doc._id, {
      de: nombreAnterior,
      a: nombreSeguro,
    });

    return (await this.mapItems([doc.toObject()]))[0];
  }

  async mover(actor: AuthUser, id: string, parentId?: string | null) {
    const doc = await this.obtenerDocumentoActivo(actor, id);
    const parentObjId = await this.parseParentId(parentId, doc.ownerId);

    if (doc.parentId?.equals(parentObjId ?? undefined)) {
      return (await this.mapItems([doc.toObject()]))[0];
    }

    if (doc.tipo === 'folder' && parentObjId) {
      await this.validarNoEsDescendiente(doc._id, parentObjId);
    }

    await this.validarNombreDisponible(
      doc.ownerId,
      parentObjId,
      doc.nombre,
      doc._id,
    );

    const desde = doc.parentId?.toString() ?? null;
    doc.parentId = parentObjId;
    doc.updatedBy = this.toObjectId(actor.userId);
    await doc.save();

    await this.registrarAuditoria(actor, 'mi_nube_mover', doc._id, {
      nombre: doc.nombre,
      desde,
      hasta: parentObjId?.toString() ?? null,
    });

    return (await this.mapItems([doc.toObject()]))[0];
  }

  async eliminar(actor: AuthUser, id: string) {
    const doc = await this.obtenerDocumentoActivo(actor, id);
    const idsAEliminar = await this.obtenerIdsParaBorradoLogico(doc);

    await this.documentoModel.updateMany(
      { _id: { $in: idsAEliminar }, ownerId: doc.ownerId, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          updatedBy: this.toObjectId(actor.userId),
        },
      },
    );

    await this.registrarAuditoria(actor, 'mi_nube_eliminar', doc._id, {
      nombre: doc.nombre,
      tipo: doc.tipo,
      eliminados: idsAEliminar.length,
    });

    return { message: 'Elemento eliminado correctamente.' };
  }

  private getOwnerId(actor: AuthUser): Types.ObjectId {
    if (!['evaluador', 'administrador'].includes(actor.rol)) {
      throw new ForbiddenException('No tienes acceso a Mi nube.');
    }
    return this.toObjectId(actor.userId);
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identificador inválido.');
    }
    return new Types.ObjectId(id);
  }

  private async parseParentId(
    parentId: string | null | undefined,
    ownerId: Types.ObjectId,
  ): Promise<Types.ObjectId | null> {
    if (!parentId) return null;
    if (!Types.ObjectId.isValid(parentId)) {
      throw new BadRequestException('parentId inválido.');
    }

    const parentObjId = new Types.ObjectId(parentId);
    const parent = await this.documentoModel.findOne({
      _id: parentObjId,
      ownerId,
      tipo: 'folder',
      isDeleted: false,
    });
    if (!parent) throw new NotFoundException('Carpeta destino no encontrada.');
    return parentObjId;
  }

  private async obtenerDocumentoActivo(actor: AuthUser, id: string) {
    const ownerId = this.getOwnerId(actor);
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('id inválido.');
    }

    const doc = await this.documentoModel.findOne({
      _id: new Types.ObjectId(id),
      ownerId,
      isDeleted: false,
    });
    if (!doc) throw new NotFoundException('Archivo o carpeta no encontrado.');
    return doc;
  }

  private sanitizarNombre(nombre: string): string {
    const limpio = nombre.trim().replace(/[/\\:*?"<>|]/g, '_');
    if (!limpio) throw new BadRequestException('El nombre es requerido.');
    if (limpio === '.' || limpio === '..') {
      throw new BadRequestException('Nombre inválido.');
    }
    return limpio.slice(0, 200);
  }

  private async validarNombreDisponible(
    ownerId: Types.ObjectId,
    parentId: Types.ObjectId | null,
    nombre: string,
    excluirId?: Types.ObjectId,
  ): Promise<void> {
    const query: Record<string, unknown> = {
      ownerId,
      parentId,
      nombre,
      isDeleted: false,
    };
    if (excluirId) query._id = { $ne: excluirId };

    const existe = await this.documentoModel.exists(query);
    if (existe) {
      throw new BadRequestException(`Ya existe "${nombre}" en esta carpeta.`);
    }
  }

  private obtenerExtension(nombre: string): string | null {
    const extension = extname(nombre).replace('.', '').toLowerCase();
    return extension || null;
  }

  private crearStorageKey(
    ownerId: string,
    nombre: string,
    extension: string | null,
  ): string {
    const hash = createHash('sha1').update(nombre).digest('hex').slice(0, 10);
    const suffix = extension ? `.${extension}` : '';
    return `${ownerId}/${Date.now()}-${randomUUID()}-${hash}${suffix}`;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async validarNoEsDescendiente(
    carpetaId: Types.ObjectId,
    candidatoParentId: Types.ObjectId,
  ): Promise<void> {
    if (carpetaId.equals(candidatoParentId)) {
      throw new BadRequestException(
        'No se puede mover una carpeta dentro de sí misma.',
      );
    }

    const parent = await this.documentoModel
      .findOne({ _id: candidatoParentId, isDeleted: false })
      .select('parentId')
      .lean();

    if (parent?.parentId) {
      await this.validarNoEsDescendiente(
        carpetaId,
        new Types.ObjectId(String(parent.parentId)),
      );
    }
  }

  private async obtenerIdsParaBorradoLogico(
    doc: DocumentoNubeDocument,
  ): Promise<Types.ObjectId[]> {
    const ids: Types.ObjectId[] = [doc._id];
    if (doc.tipo !== 'folder') return ids;

    const cola: Types.ObjectId[] = [doc._id];
    while (cola.length > 0) {
      const actual = cola.shift() as Types.ObjectId;
      const hijos = await this.documentoModel
        .find({ ownerId: doc.ownerId, parentId: actual, isDeleted: false })
        .select('_id tipo')
        .lean();

      for (const hijo of hijos) {
        const hijoId = new Types.ObjectId(String(hijo._id));
        ids.push(hijoId);
        if (hijo.tipo === 'folder') cola.push(hijoId);
      }
    }

    return ids;
  }

  private async mapItems(items: DocumentoNubeLean[]) {
    const userIds = [
      ...new Set(
        items
          .flatMap((item) => [item.ownerId, item.createdBy, item.updatedBy])
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    const users = await this.usuarioModel
      .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .select('nombre apellidos email')
      .lean();

    const userMap = new Map(
      users.map((user) => [
        String(user._id),
        {
          id: String(user._id),
          nombre: `${user.nombre} ${user.apellidos}`.trim(),
          email: user.email,
        },
      ]),
    );

    return items.map((item) => ({
      id: String(item._id),
      nombre: item.nombre ?? '',
      tipo: item.tipo ?? 'file',
      parentId: item.parentId ? String(item.parentId) : null,
      ownerId: item.ownerId ? String(item.ownerId) : null,
      owner: item.ownerId ? (userMap.get(String(item.ownerId)) ?? null) : null,
      storageKey: item.storageKey ?? null,
      mimeType: item.mimeType ?? null,
      size: item.size ?? 0,
      extension: item.extension ?? null,
      isDeleted: item.isDeleted ?? false,
      createdBy: item.createdBy
        ? (userMap.get(String(item.createdBy)) ?? null)
        : null,
      updatedBy: item.updatedBy
        ? (userMap.get(String(item.updatedBy)) ?? null)
        : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  private async registrarAuditoria(
    actor: AuthUser,
    accion: string,
    recursoId: unknown,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion,
      recurso: 'DocumentoNube',
      recursoId: String(recursoId),
      metadata,
    });
  }
}

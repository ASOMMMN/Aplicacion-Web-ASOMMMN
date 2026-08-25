import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  EvalArchivo,
  EvalArchivoDocument,
} from './schemas/eval-archivo.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { escapeRegex } from '../../common/utils/regex.util';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

const EVAL_CATEGORY = 'eval';

function parsearParentId(
  parentId: string | undefined | null,
): Types.ObjectId | null {
  if (!parentId) return null;
  if (!Types.ObjectId.isValid(parentId))
    throw new BadRequestException('parentId inválido.');
  return new Types.ObjectId(parentId);
}

@Injectable()
export class EvalArchivosService {
  private readonly logger = new Logger(EvalArchivosService.name);

  constructor(
    @InjectModel(EvalArchivo.name)
    private readonly archivoModel: Model<EvalArchivoDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly storage: StorageService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(postulanteId: string, parentId: string | null) {
    const parentObjId = parsearParentId(parentId);
    const items = await this.archivoModel
      .find({
        postulanteId: new Types.ObjectId(postulanteId),
        parentId: parentObjId,
      })
      .sort({ tipo: -1, nombre: 1 })
      .lean();

    return Promise.all(items.map((i) => this.mapItem(i)));
  }

  async buscar(postulanteId: string, q: string) {
    if (!q || q.trim().length < 2) return [];
    const items = await this.archivoModel
      .find({
        postulanteId: new Types.ObjectId(postulanteId),
        nombre: { $regex: escapeRegex(q.trim()), $options: 'i' },
      })
      .sort({ nombre: 1 })
      .lean();

    return Promise.all(items.map((i) => this.mapItem(i)));
  }

  async crearCarpeta(
    postulanteId: string,
    nombre: string,
    parentId: string | undefined,
    actor: AuthUser,
  ) {
    nombre = nombre.trim().replace(/[/\\]/g, '_');
    const parentObjId = parsearParentId(parentId);

    const existe = await this.archivoModel.findOne({
      postulanteId: new Types.ObjectId(postulanteId),
      parentId: parentObjId,
      nombre,
    });
    if (existe)
      throw new BadRequestException(`Ya existe "${nombre}" en esta carpeta.`);

    const doc = await this.archivoModel.create({
      postulanteId: new Types.ObjectId(postulanteId),
      parentId: parentObjId,
      nombre,
      tipo: 'carpeta',
      storagePath: '',
      tipoMime: '',
      tamanio: 0,
      creadoPor: new Types.ObjectId(actor.userId),
    });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'eval_carpeta_crear',
      recurso: 'EvalArchivo',
      recursoId: doc._id.toString(),
      metadata: {
        postulanteId,
        parentId: parentObjId?.toString() ?? null,
        nombre,
      },
    });

    return this.mapItem(doc.toObject());
  }

  async subirArchivo(
    postulanteId: string,
    parentId: string | undefined,
    file: Express.Multer.File,
    actor: AuthUser,
  ) {
    const parentObjId = parsearParentId(parentId);
    const nombre = file.originalname.replace(/[/\\]/g, '_');

    const existe = await this.archivoModel.findOne({
      postulanteId: new Types.ObjectId(postulanteId),
      parentId: parentObjId,
      nombre,
    });
    if (existe)
      throw new BadRequestException(
        `Ya existe un archivo llamado "${nombre}" aquí.`,
      );

    const carpeta = await this.resolverCarpetaPostulante(postulanteId);
    const ts = Date.now();
    const key = `${carpeta}/${ts}-${nombre}`;
    const storagePath = `${EVAL_CATEGORY}/${key}`;

    const { url, key: s3Key } = await this.storage.putObject(
      EVAL_CATEGORY,
      key,
      file.buffer,
    );

    const doc = await this.archivoModel.create({
      postulanteId: new Types.ObjectId(postulanteId),
      parentId: parentObjId,
      nombre,
      tipo: 'archivo',
      storagePath,
      cloudinaryUrl: url,
      cloudinaryPublicId: s3Key,
      storageType: 'cloudinary',
      tipoMime: file.mimetype,
      tamanio: file.size,
      creadoPor: new Types.ObjectId(actor.userId),
    });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'eval_archivo_subir',
      recurso: 'EvalArchivo',
      recursoId: doc._id.toString(),
      metadata: {
        postulanteId,
        parentId: parentObjId?.toString() ?? null,
        nombre,
        tamanio: file.size,
      },
    });

    return this.mapItem(doc.toObject());
  }

  async eliminar(id: string, actor: AuthUser) {
    const doc = await this.archivoModel.findById(id);
    if (!doc) throw new NotFoundException('Archivo/carpeta no encontrado.');

    const idsAEliminar: Types.ObjectId[] = [doc._id];

    if (doc.tipo === 'carpeta') {
      const cola: Types.ObjectId[] = [doc._id];
      while (cola.length > 0) {
        const actual = cola.shift() as Types.ObjectId;
        const hijos = await this.archivoModel
          .find({ postulanteId: doc.postulanteId, parentId: actual })
          .select('_id tipo')
          .lean();
        for (const hijo of hijos) {
          const hijoId = new Types.ObjectId(String(hijo._id));
          idsAEliminar.push(hijoId);
          if (hijo.tipo === 'carpeta') cola.push(hijoId);
        }
      }
    }

    const archivos = await this.archivoModel
      .find({ _id: { $in: idsAEliminar }, tipo: 'archivo' })
      .select('storageType cloudinaryPublicId')
      .lean();

    for (const archivo of archivos) {
      if (archivo.storageType === 'cloudinary' && archivo.cloudinaryPublicId) {
        await this.storage.removeObject(archivo.cloudinaryPublicId);
      }
    }

    await this.archivoModel.deleteMany({ _id: { $in: idsAEliminar } });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'eval_archivo_eliminar',
      recurso: 'EvalArchivo',
      recursoId: id,
      metadata: {
        nombre: doc.nombre,
        tipo: doc.tipo,
        eliminados: idsAEliminar.length,
      },
    });

    return { message: 'Eliminado correctamente.' };
  }

  async mover(id: string, parentId: string | undefined, actor: AuthUser) {
    const parentObjId = parsearParentId(parentId);
    const doc = await this.archivoModel.findById(id);
    if (!doc) throw new NotFoundException('Archivo/carpeta no encontrado.');

    if (doc.tipo === 'carpeta' && parentObjId) {
      await this.validarNoEsDescendiente(doc._id, parentObjId);
    }

    const conflicto = await this.archivoModel.findOne({
      postulanteId: doc.postulanteId,
      parentId: parentObjId,
      nombre: doc.nombre,
      _id: { $ne: doc._id },
    });
    if (conflicto)
      throw new BadRequestException(
        `Ya existe "${doc.nombre}" en la carpeta destino.`,
      );

    const desde = doc.parentId?.toString() ?? null;
    await this.archivoModel.findByIdAndUpdate(id, { parentId: parentObjId });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'eval_archivo_mover',
      recurso: 'EvalArchivo',
      recursoId: id,
      metadata: {
        nombre: doc.nombre,
        desde,
        hasta: parentObjId?.toString() ?? null,
      },
    });

    return { _id: id, parentId: parentObjId?.toString() ?? null };
  }

  async renombrar(id: string, nombre: string, actor: AuthUser) {
    nombre = nombre.trim().replace(/[/\\]/g, '_');
    const doc = await this.archivoModel.findById(id);
    if (!doc) throw new NotFoundException('Archivo/carpeta no encontrado.');

    const conflicto = await this.archivoModel.findOne({
      postulanteId: doc.postulanteId,
      parentId: doc.parentId ?? null,
      nombre,
      _id: { $ne: doc._id },
    });
    if (conflicto)
      throw new BadRequestException(`Ya existe "${nombre}" en esta carpeta.`);

    const nombreAnterior = doc.nombre;
    await this.archivoModel.findByIdAndUpdate(id, { nombre });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'eval_archivo_renombrar',
      recurso: 'EvalArchivo',
      recursoId: id,
      metadata: { de: nombreAnterior, a: nombre },
    });

    return { _id: id, nombre };
  }

  async descargar(
    id: string,
    postulanteId: string,
  ): Promise<{ url: string; nombre: string }> {
    const doc = await this.archivoModel.findOne({
      _id: new Types.ObjectId(id),
      postulanteId: new Types.ObjectId(postulanteId),
    });
    if (!doc) throw new NotFoundException('Archivo no encontrado.');
    if (doc.tipo !== 'archivo' || !doc.storagePath) {
      throw new BadRequestException('Solo los archivos se pueden descargar.');
    }
    if (doc.storageType !== 'cloudinary' || !doc.cloudinaryUrl) {
      throw new NotFoundException(
        'Este archivo es de un almacenamiento anterior y ya no está disponible. Debe volver a subirse.',
      );
    }

    return {
      url: doc.cloudinaryUrl,
      nombre: doc.nombre,
    };
  }

  private async resolverCarpetaPostulante(postulanteId: string): Promise<string> {
    const postulante = await this.postulanteModel
      .findById(postulanteId)
      .select('usuarioId')
      .lean();
    if (!postulante) return postulanteId;

    const usuario = await this.usuarioModel
      .findById(postulante.usuarioId)
      .select('nombre apellidos')
      .lean();
    return construirCarpetaPorNombre(usuario?.nombre, usuario?.apellidos) ?? postulanteId;
  }

  private async mapItem(i: {
    _id: unknown;
    nombre?: string;
    tipo?: 'archivo' | 'carpeta';
    parentId?: Types.ObjectId | null;
    tipoMime?: string;
    tamanio?: number;
    creadoEn?: Date;
    storagePath?: string;
    cloudinaryUrl?: string;
    storageType?: 'local' | 'cloudinary';
  }) {
    const esCloudinario = i.storageType === 'cloudinary' && !!i.cloudinaryUrl;
    return {
      _id: String(i._id),
      nombre: i.nombre,
      tipo: i.tipo,
      parentId: i.parentId ? String(i.parentId) : null,
      tipoMime: i.tipoMime,
      tamanio: i.tamanio,
      creadoEn: i.creadoEn,
      storageType:
        i.tipo === 'archivo'
          ? esCloudinario
            ? 'cloudinary'
            : 'local'
          : undefined,
      urlDescargar: esCloudinario
        ? await this.storage.getSecureDownloadUrl(
            i.cloudinaryUrl!,
            i.nombre ?? 'archivo',
            i.tipoMime ?? 'application/octet-stream',
          )
        : undefined,
    };
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
    const parent = await this.archivoModel
      .findById(candidatoParentId)
      .select('parentId')
      .lean();
    if (parent?.parentId) {
      await this.validarNoEsDescendiente(
        carpetaId,
        new Types.ObjectId(String(parent.parentId)),
      );
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  DocPersonal,
  DocPersonalDocument,
} from './schemas/doc-personal.schema';
import {
  TIPOS_DOC_PERSONAL,
  LABEL_TIPO_DOC,
  TipoDocPersonal,
} from './constants/tipos-doc-personal';
import {
  DocPersonalResponseDto,
  MisDocsResponseDto,
  ResumenTipoDto,
} from './dto/doc-personal.dto';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
/** Carpeta Cloudinary: asommmn/documentos (requisito explícito de la migración) */
const STORAGE_CATEGORY = 'documentos';

@Injectable()
export class DocsPersonalesService {
  constructor(
    @InjectModel(DocPersonal.name)
    private readonly docModel: Model<DocPersonalDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly storage: StorageService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async obtenerPostulante(
    usuarioId: string,
  ): Promise<PostulanteDocument> {
    let postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(usuarioId),
    });
    if (!postulante) {
      postulante = await this.postulanteModel.create({
        usuarioId: new Types.ObjectId(usuarioId),
        estadoPostulacion: 'en_proceso',
      });
    }
    return postulante;
  }

  private async toResponseDto(
    doc: DocPersonalDocument,
  ): Promise<DocPersonalResponseDto> {
    const storageType: 'local' | 'cloudinary' =
      doc.storageType === 'cloudinary' && doc.cloudinaryUrl
        ? 'cloudinary'
        : 'local';

    return {
      _id: doc._id.toString(),
      tipo: doc.tipo,
      nombreOriginal: doc.nombreOriginal,
      tamanio: doc.tamanio,
      tipoMime: doc.tipoMime,
      subidasEn: doc.subidasEn,
      urlDescargar:
        storageType === 'cloudinary'
          ? await this.storage.getSecureDownloadUrl(
              doc.cloudinaryUrl!,
              doc.nombreOriginal,
              doc.tipoMime,
            )
          : undefined,
      storageType,
    };
  }

  private async buildResumen(
    docs: DocPersonalDocument[],
  ): Promise<MisDocsResponseDto> {
    const tipos: ResumenTipoDto[] = await Promise.all(
      TIPOS_DOC_PERSONAL.map(async (tipo) => {
        const archivos = await Promise.all(
          docs
            .filter((d) => d.tipo === tipo)
            .map((d) => this.toResponseDto(d)),
        );
        return {
          tipo,
          label: LABEL_TIPO_DOC[tipo],
          cantidad: archivos.length,
          archivos,
        };
      }),
    );
    const tiposConArchivos = tipos.filter((t) => t.cantidad > 0).length;
    return { tipos, totalArchivos: docs.length, tiposConArchivos };
  }

  // ── Postulante: subir ──────────────────────────────────────────────────────

  async subir(
    actor: AuthUser,
    tipo: TipoDocPersonal,
    file: Express.Multer.File,
  ): Promise<DocPersonalResponseDto> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    if (!ACCEPTED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Sube un PDF, JPG o PNG.',
      );
    }
    if (!TIPOS_DOC_PERSONAL.includes(tipo)) {
      throw new BadRequestException('Tipo de documento inválido.');
    }

    const postulante = await this.obtenerPostulante(actor.userId);

    const usuario = await this.usuarioModel
      .findById(actor.userId)
      .select('nombre apellidos')
      .lean();
    const carpeta =
      construirCarpetaPorNombre(usuario?.nombre, usuario?.apellidos) ??
      actor.userId;

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${carpeta}/${tipo}/${Date.now()}-${safeName}`;

    const { url, key: s3Key } = await this.storage.putObject(
      STORAGE_CATEGORY,
      key,
      file.buffer,
    );

    const doc = await this.docModel.create({
      postulanteId: postulante._id,
      usuarioId: new Types.ObjectId(actor.userId),
      tipo,
      nombreOriginal: file.originalname,
      tipoMime: file.mimetype,
      tamanio: file.size,
      storagePath: `${STORAGE_CATEGORY}/${key}`,
      cloudinaryUrl: url,
      cloudinaryPublicId: s3Key,
      storageType: 'cloudinary',
      subidasPor: new Types.ObjectId(actor.userId),
      subidasEn: new Date(),
    });

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_subir',
      recurso: 'DocPersonal',
      recursoId: doc._id.toString(),
      metadata: { tipo, tamanio: file.size, nombreOriginal: file.originalname },
    });

    return this.toResponseDto(doc);
  }

  // ── Postulante: listar propios ────────────────────────────────────────────

  async listarMios(actor: AuthUser): Promise<MisDocsResponseDto> {
    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(actor.userId),
    });
    if (!postulante) return this.buildResumen([]);

    const docs = await this.docModel
      .find({ postulanteId: postulante._id })
      .sort({ subidasEn: -1 });
    return this.buildResumen(docs);
  }

  // ── Postulante / Admin: eliminar ──────────────────────────────────────────

  async eliminar(actor: AuthUser, docId: string): Promise<void> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    // Postulante solo puede borrar sus propios docs
    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este documento.',
      );
    }

    if (doc.storageType === 'cloudinary' && doc.cloudinaryPublicId) {
      await this.storage.removeObject(doc.cloudinaryPublicId);
    }

    await this.docModel.findByIdAndDelete(docId);

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_eliminar',
      recurso: 'DocPersonal',
      recursoId: docId,
      metadata: { tipo: doc.tipo, nombreOriginal: doc.nombreOriginal },
    });
  }

  // ── Postulante: URL de descarga de un doc propio ─────────────────────────

  async urlDescargar(
    actor: AuthUser,
    docId: string,
  ): Promise<DocPersonalResponseDto> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para descargar este documento.',
      );
    }
    return this.toResponseDto(doc);
  }

  // ── Postulante: renombrar ─────────────────────────────────────────────────

  async renombrar(
    actor: AuthUser,
    docId: string,
    nuevoNombre: string,
  ): Promise<void> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    if (
      actor.rol === 'postulante' &&
      doc.usuarioId.toString() !== actor.userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para renombrar este documento.',
      );
    }

    const anterior = doc.nombreOriginal;
    doc.nombreOriginal = nuevoNombre.trim();
    await doc.save();

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_renombrar',
      recurso: 'DocPersonal',
      recursoId: docId,
      metadata: { anterior, nuevo: doc.nombreOriginal },
    });
  }

  // ── Evaluador / Admin: listar por postulanteId ───────────────────────────

  async listarPorPostulante(postulanteId: string): Promise<MisDocsResponseDto> {
    const docs = await this.docModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .sort({ subidasEn: -1 });
    return this.buildResumen(docs);
  }
}

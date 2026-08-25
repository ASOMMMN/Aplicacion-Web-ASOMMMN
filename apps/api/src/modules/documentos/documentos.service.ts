import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';

import { Documento, DocumentoDocument } from './schemas/documento.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  DocumentoActualResponseDto,
  HistorialDocumentosResponseDto,
} from './dto/documento-response.dto';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

const CV_CATEGORY = 'cvs';
const MAX_VERSIONS = 10;

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    @InjectModel(Documento.name)
    private documentoModel: Model<DocumentoDocument>,
    @InjectModel(Postulante.name)
    private postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private usuarioModel: Model<UsuarioDocument>,
    private storageService: StorageService,
    private auditoriaService: AuditoriaService,
  ) {}

  async subirCV(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentoActualResponseDto> {
    if (!file) throw new BadRequestException('No se envió archivo');
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Usuario autenticado inválido');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Solo se aceptan archivos PDF');
    }

    const postulante = await this.obtenerOCrearPostulante(userId);

    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const duplicado = await this.documentoModel.findOne({
      postulanteId: postulante._id,
      hash,
      esActual: true,
    });
    if (duplicado) {
      throw new BadRequestException(
        'Este CV ya fue cargado anteriormente (idéntico)',
      );
    }

    const ultimoDoc = await this.documentoModel
      .findOne({ postulanteId: postulante._id })
      .sort({ version: -1 });

    const newVersion = (ultimoDoc?.version ?? 0) + 1;
    if (newVersion > MAX_VERSIONS) {
      throw new BadRequestException(
        `Máximo ${MAX_VERSIONS} versiones permitidas.`,
      );
    }

    await this.documentoModel.updateMany(
      { postulanteId: postulante._id },
      { esActual: false },
    );

    const usuario = await this.usuarioModel
      .findById(userId)
      .select('nombre apellidos')
      .lean();
    const carpeta =
      construirCarpetaPorNombre(usuario?.nombre, usuario?.apellidos) ??
      userId;
    const key = `${carpeta}/postulante-${userId}-v${newVersion}.pdf`;

    try {
      const { url, key: s3Key } = await this.storageService.putObject(
        CV_CATEGORY,
        key,
        file.buffer,
      );

      const documento = await this.documentoModel.create({
        postulanteId: postulante._id,
        usuarioId: new Types.ObjectId(userId),
        nombreOriginal: file.originalname,
        tipoMime: file.mimetype,
        tamanio: file.size,
        hash,
        storagePath: `${CV_CATEGORY}/${key}`,
        cloudinaryUrl: url,
        cloudinaryPublicId: s3Key,
        storageType: 'cloudinary',
        version: newVersion,
        esActual: true,
        subidasPor: new Types.ObjectId(userId),
        subidasEn: new Date(),
      });

      const urlDescargar = await this.storageService.getSecureDownloadUrl(
        url,
        file.originalname,
        file.mimetype,
      );

      return {
        _id: documento._id.toString(),
        nombreOriginal: documento.nombreOriginal,
        tamanio: documento.tamanio,
        version: documento.version,
        subidasEn: documento.subidasEn,
        urlDescargar,
        storageType: 'cloudinary',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al subir CV: ${msg}`);
      throw new BadRequestException(`Error al subir el archivo: ${msg}`);
    }
  }

  private async obtenerOCrearPostulante(
    userId: string,
  ): Promise<PostulanteDocument> {
    const objectId = new Types.ObjectId(userId);
    const existente = await this.postulanteModel.findOne({
      usuarioId: objectId,
    });
    if (existente) return existente;

    this.logger.warn(
      `Perfil de postulante no encontrado para ${userId}. Creando automáticamente.`,
    );
    return this.postulanteModel.create({
      usuarioId: objectId,
      estadoPostulacion: 'en_proceso',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });
  }

  private async toDto(
    documento: DocumentoDocument,
  ): Promise<DocumentoActualResponseDto> {
    const storageType: 'local' | 'cloudinary' =
      documento.storageType === 'cloudinary' && documento.cloudinaryUrl
        ? 'cloudinary'
        : 'local';

    return {
      _id: documento._id.toString(),
      nombreOriginal: documento.nombreOriginal,
      tamanio: documento.tamanio,
      version: documento.version,
      subidasEn: documento.subidasEn,
      urlDescargar:
        storageType === 'cloudinary'
          ? await this.storageService.getSecureDownloadUrl(
              documento.cloudinaryUrl!,
              documento.nombreOriginal,
              documento.tipoMime,
            )
          : undefined,
      storageType,
    };
  }

  async obtenerCVActual(
    userId: string,
  ): Promise<DocumentoActualResponseDto | null> {
    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });
    if (!postulante) return null;

    const documento = await this.documentoModel.findOne({
      postulanteId: postulante._id,
      esActual: true,
    });
    if (!documento) return null;

    return this.toDto(documento);
  }

  async obtenerHistorial(
    userId: string,
  ): Promise<HistorialDocumentosResponseDto> {
    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(userId),
    });
    if (!postulante) return { documentos: [], total: 0 };

    const documentos = await this.documentoModel
      .find({ postulanteId: postulante._id })
      .sort({ version: -1 })
      .lean();

    return {
      documentos: documentos.map((doc) => ({
        _id: doc._id.toString(),
        nombreOriginal: doc.nombreOriginal,
        tamanio: doc.tamanio,
        version: doc.version,
        esActual: doc.esActual,
        subidasEn: doc.subidasEn,
        subidasPor: doc.subidasPor?.toString(),
      })),
      total: documentos.length,
    };
  }

  async obtenerCVPostulante(
    postulanteId: string,
  ): Promise<DocumentoActualResponseDto | null> {
    const documento = await this.documentoModel.findOne({
      postulanteId: new Types.ObjectId(postulanteId),
      esActual: true,
    });
    if (!documento) return null;

    return this.toDto(documento);
  }

  async descargarDocumento(
    documentoId: string,
    userId: string,
  ): Promise<DocumentoActualResponseDto> {
    const documento = await this.documentoModel.findById(documentoId);
    if (!documento) throw new NotFoundException('Documento no encontrado');

    if (documento.usuarioId.toString() !== userId) {
      throw new BadRequestException('No tienes acceso a este documento');
    }

    return this.toDto(documento);
  }

  /** Used by ingest-ia to read el buffer del PDF desde Cloudinary */
  async getDocumentBuffer(documento: DocumentoDocument): Promise<Buffer> {
    if (documento.storageType !== 'cloudinary' || !documento.cloudinaryUrl) {
      throw new BadRequestException(
        'Este CV es de un almacenamiento anterior y ya no está disponible. Vuelve a subirlo.',
      );
    }
    return this.storageService.getObjectBuffer(documento.cloudinaryUrl);
  }

  async eliminarCV(
    userId: string,
    docId: string,
  ): Promise<{ message: string }> {
    const doc = await this.documentoModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.usuarioId.toString() !== userId) {
      throw new BadRequestException('No tienes acceso a este documento');
    }

    const wasActual = doc.esActual;
    const postulanteId = doc.postulanteId;

    if (doc.storageType === 'cloudinary' && doc.cloudinaryPublicId) {
      await this.storageService.removeObject(doc.cloudinaryPublicId);
    }
    await this.documentoModel.findByIdAndDelete(docId);

    if (wasActual) {
      const prev = await this.documentoModel
        .findOne({ postulanteId })
        .sort({ version: -1 });
      if (prev) {
        prev.esActual = true;
        await prev.save();
      }
    }

    const postulante = await this.postulanteModel.findById(postulanteId).lean();
    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: postulante?.usuarioId?.toString() ?? userId,
      accion: 'cv_eliminar',
      recurso: 'Documento',
      recursoId: docId,
      metadata: { version: doc.version, nombreOriginal: doc.nombreOriginal },
    });

    return { message: 'Documento eliminado.' };
  }

  async renombrarCV(
    userId: string,
    docId: string,
    nombreOriginal: string,
  ): Promise<{ message: string }> {
    const doc = await this.documentoModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.usuarioId.toString() !== userId) {
      throw new BadRequestException('No tienes acceso a este documento');
    }

    const anterior = doc.nombreOriginal;
    doc.nombreOriginal = nombreOriginal.trim();
    await doc.save();

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail: userId,
      accion: 'cv_renombrar',
      recurso: 'Documento',
      recursoId: docId,
      metadata: { anterior, nuevo: doc.nombreOriginal },
    });

    return { message: 'Nombre actualizado.' };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { crearClienteOpenAI } from '../../common/utils/openai-client.util';
import {
  ExtraerDocPersonalIaResponse,
  extraerFechasDocPersonal,
} from './ia/extraer-fechas-doc-personal';
import { configLecturaDesdeEnv } from './ia/lectura-documento';
import { cambiosPorAnalisis } from './ia/cambios-analisis';
import { estadoExtraccion } from './ia/estado-extraccion';
import type { ResultadoExtraccionFechas } from './ia/extraer-fechas-doc-personal';

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
  VerificarFechasDocPersonalDto,
} from './dto/doc-personal.dto';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';

const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Carpeta Cloudinary: asommmn/documentos */
const STORAGE_CATEGORY = 'documentos';

export type { ExtraerDocPersonalIaResponse } from './ia/extraer-fechas-doc-personal';

/** Qué disparó un análisis (se guarda en auditoría). */
export type DisparadorAnalisis = 'subida' | 'reanalisis' | 'lote';

@Injectable()
export class DocsPersonalesService {
  private readonly logger = new Logger(DocsPersonalesService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectModel(DocPersonal.name)
    private readonly docModel: Model<DocPersonalDocument>,

    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,

    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,

    private readonly storage: StorageService,

    private readonly auditoria: AuditoriaService,

    private readonly configService: ConfigService,
  ) {
    this.openai = crearClienteOpenAI(
      this.configService.get<string>('OPENAI_API_KEY', ''),
    );
  }

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
    const extraccion = estadoExtraccion(doc);

    return {
      _id: doc._id.toString(),
      tipo: doc.tipo,
      nombreOriginal: doc.nombreOriginal,
      tamanio: doc.tamanio,
      tipoMime: doc.tipoMime,
      subidasEn: doc.subidasEn,

      fechaInicio: doc.fechaInicio,
      fechaVencimiento: doc.fechaVencimiento,
      fechaEmision: doc.fechaEmision,
      revisarFechas: Boolean(doc.revisarFechas),
      motivosRevision: doc.motivosRevision ?? [],
      tipoSospechoso: doc.tipoSospechoso ?? null,
      analizadoEn: doc.analisisIa?.analizadoEn,
      errorAnalisis: doc.analisisIa?.error,
      fechasVerificadas: Boolean(doc.fechasVerificadas),
      extraccionEstado: extraccion.estado,
      extraccionError: extraccion.error,

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
          docs.filter((d) => d.tipo === tipo).map((d) => this.toResponseDto(d)),
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

    return {
      tipos,
      totalArchivos: docs.length,
      tiposConArchivos,
    };
  }

  // ── Extracción IA ──────────────────────────────────────────────────────────

  /**
   * Analiza un documento personal mediante IA y devuelve las fechas que
   * aparecen explícitamente (lógica en ia/extraer-fechas-doc-personal.ts,
   * compartida con scripts/backfill-fechas-docs-personales.ts).
   *
   * No guarda el documento ni modifica MongoDB; solo registra auditoría
   * cuando el modelo respondió.
   */
  async extraerDatosDocPersonalIa(
    fileBuffer: Buffer,
    userId: string,
    tipoDocumento: TipoDocPersonal,
    mimeType: string,
    actorEmail: string,
  ): Promise<ExtraerDocPersonalIaResponse> {
    const modelo = this.configService.get<string>(
      'OPENAI_MODEL',
      'gpt-4o-mini',
    );
    const { resultado, origen } = await extraerFechasDocPersonal({
      buffer: fileBuffer,
      mimeType,
      tipo: tipoDocumento,
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
      modelo,
      openai: this.openai,
      lectura: configLecturaDesdeEnv((k) => this.configService.get<string>(k)),
      onError: (m) => this.logger.error(m),
    });

    if (resultado.iaDisponible && !resultado.errorMensaje) {
      await this.auditoria.registrar({
        actorId: userId,
        actorEmail,
        accion: 'doc_personal_extraccion_ia',
        recurso: 'DocPersonal',
        recursoId: 'extraer-ia',
        metadata: {
          modelo,
          tipoDocumento,
          mimeType,
          origen,
          fechaInicioExtraida: resultado.fechaInicio,
          fechaVencimientoExtraida: resultado.fechaVencimiento,
          fechaEmisionExtraida: resultado.fechaEmision,
          confianza: resultado.confianza,
        },
      });
    }

    return resultado;
  }

  /**
   * Analiza el archivo con IA (lectura robusta + prompts por tipo +
   * validación en código) y guarda el resultado en el documento.
   * Nunca lanza: un fallo queda registrado en analisisIa.error sin tocar
   * las fechas existentes.
   */
  private async analizarYGuardar(
    doc: DocPersonalDocument,
    buffer: Buffer,
    actor: AuthUser,
    disparadoPor: DisparadorAnalisis,
  ): Promise<ResultadoExtraccionFechas> {
    const r = await extraerFechasDocPersonal({
      buffer,
      mimeType: doc.tipoMime,
      tipo: doc.tipo,
      apiKey: this.configService.get<string>('OPENAI_API_KEY', ''),
      modelo: this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
      openai: this.openai,
      lectura: configLecturaDesdeEnv((k) => this.configService.get<string>(k)),
      onError: (m) => this.logger.error(`[doc ${doc._id.toString()}] ${m}`),
    });

    try {
      doc.set(
        cambiosPorAnalisis(r, {
          fechasVerificadas: Boolean(doc.fechasVerificadas),
        }),
      );
      await doc.save();
    } catch (err) {
      this.logger.error(
        `No se pudo guardar el análisis del documento ${doc._id.toString()}: ${(err as Error).message}`,
      );
    }

    await this.auditarAnalisis(doc, r, actor, disparadoPor);
    return r;
  }

  /** Un registro por análisis, con el id del documento, también si falló. */
  private async auditarAnalisis(
    doc: DocPersonalDocument,
    r: ResultadoExtraccionFechas,
    actor: AuthUser,
    disparadoPor: DisparadorAnalisis,
  ): Promise<void> {
    const res = r.resultado;
    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: res.errorMensaje
        ? 'doc_personal_extraccion_ia_error'
        : 'doc_personal_extraccion_ia',
      recurso: 'DocPersonal',
      recursoId: doc._id.toString(),
      metadata: {
        disparadoPor,
        postulanteId: doc.postulanteId?.toString(),
        modelo: r.modelo,
        tipoDocumento: doc.tipo,
        mimeType: doc.tipoMime,
        origen: r.origen,
        paginasLeidas: r.paginasLeidas,
        paginasTotales: r.paginasTotales,
        avisoLectura: r.aviso,
        error: res.errorMensaje,
        fechaInicioExtraida: res.fechaInicio,
        fechaVencimientoExtraida: res.fechaVencimiento,
        fechaEmisionExtraida: res.fechaEmision,
        confianza: res.confianza,
        motivosRevision: res.motivosRevision,
        fechasDescartadas: res.fechasDescartadas,
        tipoSospechoso: res.tipoSospechoso,
        fechasVerificadasConservadas: Boolean(doc.fechasVerificadas),
        respuestaCruda: r.respuestaCruda?.slice(0, 2000),
      },
    });
  }

  // ── Evaluador / Admin: corrección manual de fechas ────────────────────────

  /**
   * Fija las fechas a mano. Quedan en fechasVerificadas y en los campos de
   * fecha; un nuevo análisis con IA ya no las sobrescribe.
   */
  async verificarFechas(
    actor: AuthUser,
    docId: string,
    dto: VerificarFechasDocPersonalDto,
  ): Promise<DocPersonalResponseDto> {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    const aFecha = (v: string | null | undefined) =>
      v ? new Date(`${v}T00:00:00.000Z`) : null;
    const nuevas = {
      fechaEmision: aFecha(dto.fechaEmision),
      fechaInicio: aFecha(dto.fechaInicio),
      fechaVencimiento: aFecha(dto.fechaVencimiento),
    };
    const desde = nuevas.fechaEmision ?? nuevas.fechaInicio;
    if (desde && nuevas.fechaVencimiento && nuevas.fechaVencimiento <= desde) {
      throw new BadRequestException(
        'El vencimiento debe ser posterior a la emisión/inicio.',
      );
    }

    const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const antes = {
      fechaEmision: iso(doc.fechaEmision),
      fechaInicio: iso(doc.fechaInicio),
      fechaVencimiento: iso(doc.fechaVencimiento),
    };

    doc.set({
      ...nuevas,
      revisarFechas: false,
      motivosRevision: [],
      extraccionEstado: 'ok',
      extraccionError: null,
      fechasVerificadas: {
        ...nuevas,
        verificadoPor: new Types.ObjectId(actor.userId),
        verificadoPorEmail: actor.email,
        verificadoEn: new Date(),
      },
    });
    await doc.save();

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_fechas_verificadas',
      recurso: 'DocPersonal',
      recursoId: docId,
      metadata: {
        tipoDocumento: doc.tipo,
        postulanteId: doc.postulanteId?.toString(),
        antes,
        despues: {
          fechaEmision: iso(nuevas.fechaEmision),
          fechaInicio: iso(nuevas.fechaInicio),
          fechaVencimiento: iso(nuevas.fechaVencimiento),
        },
      },
    });

    return this.toResponseDto(doc);
  }

  // ── Postulante: subir ──────────────────────────────────────────────────────

  async subir(
    actor: AuthUser,
    tipo: TipoDocPersonal,
    file: Express.Multer.File,
  ): Promise<DocPersonalResponseDto> {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

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

    // Extrae automáticamente las fechas al subir el documento.
    // Si la IA falla, NO se cancela la subida: el documento permanece guardado
    // y el error queda en analisisIa para reintentar con "Volver a analizar".
    await this.analizarYGuardar(doc, file.buffer, actor, 'subida');

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_subir',
      recurso: 'DocPersonal',
      recursoId: doc._id.toString(),
      metadata: {
        tipo,
        tamanio: file.size,
        nombreOriginal: file.originalname,
      },
    });

    return this.toResponseDto(doc);
  }

  // ── Postulante: listar propios ────────────────────────────────────────────

  async listarMios(actor: AuthUser): Promise<MisDocsResponseDto> {
    const postulante = await this.postulanteModel.findOne({
      usuarioId: new Types.ObjectId(actor.userId),
    });

    if (!postulante) {
      return this.buildResumen([]);
    }

    const docs = await this.docModel
      .find({
        postulanteId: postulante._id,
      })
      .sort({
        subidasEn: -1,
      });

    return this.buildResumen(docs);
  }

  // ── Postulante / Admin: eliminar ──────────────────────────────────────────

  async eliminar(actor: AuthUser, docId: string): Promise<void> {
    const doc = await this.docModel.findById(docId);

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

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
      metadata: {
        tipo: doc.tipo,
        nombreOriginal: doc.nombreOriginal,
      },
    });
  }

  // ── Postulante: URL de descarga de un doc propio ─────────────────────────

  async urlDescargar(
    actor: AuthUser,
    docId: string,
  ): Promise<DocPersonalResponseDto> {
    const doc = await this.docModel.findById(docId);

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

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

    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }

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
      metadata: {
        anterior,
        nuevo: doc.nombreOriginal,
      },
    });
  }

  // ── Resumen de fechas: datos mínimos, sin firmar URLs ─────────────────────

  /** Todos los documentos del postulante, del más reciente al más antiguo. */
  async listarFechasPorPostulante(
    postulanteId: string,
  ): Promise<
    Array<
      Pick<
        DocPersonal,
        | 'tipo'
        | 'nombreOriginal'
        | 'subidasEn'
        | 'fechaInicio'
        | 'fechaEmision'
        | 'fechaVencimiento'
        | 'revisarFechas'
        | 'motivosRevision'
        | 'fechasVerificadas'
        | 'analisisIa'
        | 'extraccionEstado'
        | 'extraccionError'
      > & { _id: Types.ObjectId }
    >
  > {
    return this.docModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .select(
        'tipo nombreOriginal subidasEn fechaInicio fechaEmision fechaVencimiento revisarFechas motivosRevision fechasVerificadas analisisIa extraccionEstado extraccionError',
      )
      .sort({ subidasEn: -1 })
      .lean();
  }

  // ── Evaluador / Admin: listar por postulanteId ───────────────────────────

  async listarPorPostulante(postulanteId: string): Promise<MisDocsResponseDto> {
    const docs = await this.docModel
      .find({
        postulanteId: new Types.ObjectId(postulanteId),
      })
      .sort({
        subidasEn: -1,
      });

    return this.buildResumen(docs);
  }
}

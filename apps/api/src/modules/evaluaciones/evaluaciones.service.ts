import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';

import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import {
  Documento,
  DocumentoDocument,
} from '../documentos/schemas/documento.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  DocPersonal,
  DocPersonalDocument,
} from '../docs-personales/schemas/doc-personal.schema';
import { DocumentosService } from '../documentos/documentos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CrearEvaluacionDto } from './dto/crear-evaluacion.dto';
import { DecidirCandidatoDto } from './dto/decidir-candidato.dto';
import {
  CandidatoDetalleDto,
  CandidatoListaItemDto,
  EvaluacionDocumentoDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
} from './dto/evaluaciones-response.dto';
import { Evaluacion, EvaluacionDocument } from './schemas/evaluacion.schema';
import {
  CLAVES_REQUISITO,
  REQUISITOS_EXPEDIENTE,
  calcularSemaforo,
  resolverEstadoExpediente,
} from '../postulantes/constants/expediente.constants';

const DOCUMENTO_CLAVE_LEGADO = 'general';

function calcularEstadoEvaluacion(
  docsEvaluados: number,
  docsTotal: number,
): 'pendiente' | 'en_evaluacion' | 'evaluado' {
  if (docsEvaluados === 0) return 'pendiente';
  if (docsEvaluados >= docsTotal) return 'evaluado';
  return 'en_evaluacion';
}

@Injectable()
export class EvaluacionesService {
  private readonly logger = new Logger(EvaluacionesService.name);

  constructor(
    @InjectModel(Postulante.name)
    private postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Documento.name)
    private documentoModel: Model<DocumentoDocument>,
    @InjectModel(Usuario.name)
    private usuarioModel: Model<UsuarioDocument>,
    @InjectModel(DocPersonal.name)
    private docPersonalModel: Model<DocPersonalDocument>,
    @InjectModel(Evaluacion.name)
    private evaluacionModel: Model<EvaluacionDocument>,
    private documentosService: DocumentosService,
    private auditoria: AuditoriaService,
    private notificaciones: NotificacionesService,
    private config: ConfigService,
  ) {}

  async listarTodas(): Promise<EvaluacionGlobalItemDto[]> {
    const evaluaciones = await this.evaluacionModel
      .find()
      .populate('evaluadorId', 'nombre apellidos')
      .populate({
        path: 'postulanteId',
        populate: { path: 'usuarioId', select: 'nombre apellidos' },
      })
      .sort({ creadoEn: -1 })
      .lean();

    return evaluaciones.map((item: any) => {
      const postulante = item.postulanteId;
      const usuario = postulante?.usuarioId;
      return {
        id: String(item._id),
        postulanteId: String(postulante?._id ?? ''),
        postulanteName:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        documentoClave: item.documentoClave,
        evaluadorId: String(item.evaluadorId?._id ?? ''),
        evaluadorNombre:
          `${item.evaluadorId?.nombre ?? ''} ${item.evaluadorId?.apellidos ?? ''}`.trim(),
        comentario: item.comentario,
        calificacion: item.calificacion,
        estadoSugerido: item.estadoSugerido,
        creadoEn: item.creadoEn,
      };
    });
  }

  async listarCandidatos(): Promise<CandidatoListaItemDto[]> {
    const postulantes = await this.postulanteModel
      .find()
      .populate('usuarioId', 'nombre apellidos email')
      .sort({ actualizadoEn: -1 })
      .lean();

    const postulanteIds = postulantes.map((p) => p._id);

    const [cvsActuales, docsPersonalesList, evaluacionesList] =
      await Promise.all([
        this.documentoModel
          .find({ postulanteId: { $in: postulanteIds }, esActual: true })
          .select('postulanteId version subidasEn')
          .lean(),
        this.docPersonalModel
          .find({ postulanteId: { $in: postulanteIds } })
          .select('postulanteId tipo')
          .lean(),
        this.evaluacionModel
          .find({ postulanteId: { $in: postulanteIds } })
          .select('postulanteId documentoClave')
          .lean(),
      ]);

    const cvByPostulante = new Map<
      string,
      { version: number; subidasEn: Date }
    >();
    for (const cv of cvsActuales) {
      cvByPostulante.set(String(cv.postulanteId), {
        version: cv.version,
        subidasEn: cv.subidasEn,
      });
    }

    const dpByPostulante = new Map<string, Set<string>>();
    for (const dp of docsPersonalesList) {
      const key = String(dp.postulanteId);
      if (!dpByPostulante.has(key)) dpByPostulante.set(key, new Set());
      dpByPostulante.get(key)!.add(dp.tipo);
    }

    const docsEvaluadosByPostulante = new Map<string, Set<string>>();
    for (const ev of evaluacionesList) {
      // Registros legado previos a la migración de documentoClave (el campo
      // no existía) llegan aquí con documentoClave undefined, no 'general'.
      // Tratarlos igual: no cuentan como documento evaluado.
      if (!ev.documentoClave || ev.documentoClave === DOCUMENTO_CLAVE_LEGADO) {
        continue;
      }
      const key = String(ev.postulanteId);
      if (!docsEvaluadosByPostulante.has(key)) {
        docsEvaluadosByPostulante.set(key, new Set());
      }
      docsEvaluadosByPostulante.get(key)!.add(ev.documentoClave);
    }

    const idsACorregir: Types.ObjectId[] = [];

    const resultado = postulantes.map((p: any) => {
      const user = p.usuarioId;
      const cv = cvByPostulante.get(String(p._id));
      const tiposDP = dpByPostulante.get(String(p._id)) ?? new Set<string>();

      const tieneCV = Boolean(cv);
      const tieneVacante = Boolean((p.vacante as string | undefined)?.trim());

      const cumplidos = new Set<string>(tiposDP);
      if (tieneCV) cumplidos.add('cv');
      if (tieneVacante) cumplidos.add('vacante');

      // Solo requisitos obligatorios cuentan para "Falta: ..." y el % de
      // avance (ej. la vacuna de fiebre amarilla es opcional).
      const requisitosObligatorios = REQUISITOS_EXPEDIENTE.filter(
        (r) => r.requerido,
      );
      const requisitosFaltantes = requisitosObligatorios
        .filter((r) => !cumplidos.has(r.clave))
        .map((r) => r.label);

      const porcentajeExpediente = Math.round(
        ((requisitosObligatorios.length - requisitosFaltantes.length) /
          requisitosObligatorios.length) *
          100,
      );

      const estadoGuardado: 'en_proceso' | 'enviado' =
        p.estadoExpediente ?? 'en_proceso';
      const estadoExpediente = resolverEstadoExpediente(
        porcentajeExpediente,
        estadoGuardado,
      );
      if (estadoExpediente !== estadoGuardado) {
        idsACorregir.push((p as { _id: Types.ObjectId })._id);
      }

      const docsEvaluados =
        docsEvaluadosByPostulante.get(String(p._id))?.size ?? 0;
      const docsTotal = CLAVES_REQUISITO.length;

      return {
        postulanteId: String(p._id),
        nombreCompleto: `${user?.nombre ?? ''} ${user?.apellidos ?? ''}`.trim(),
        email: user?.email ?? '',
        estadoPostulacion: p.estadoPostulacion,
        ciudad: p.ciudad,
        pais: p.pais,
        vacante: p.vacante,
        tieneCV,
        versionCV: cv?.version,
        actualizadoEn: p.actualizadoEn,
        estadoExpediente,
        porcentajeExpediente,
        requisitosFaltantes,
        semaforoClave: calcularSemaforo(
          tieneCV,
          tieneVacante,
          porcentajeExpediente,
          estadoExpediente,
        ),
        docsEvaluados,
        docsTotal,
        estadoEvaluacion: calcularEstadoEvaluacion(docsEvaluados, docsTotal),
      };
    });

    if (idsACorregir.length > 0) {
      await this.postulanteModel.updateMany(
        { _id: { $in: idsACorregir } },
        { $set: { estadoExpediente: 'en_proceso' }, $unset: { enviadoEn: '' } },
      );
    }

    return resultado;
  }

  async obtenerCandidato(postulanteId: string): Promise<CandidatoDetalleDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const postulante = await this.postulanteModel
      .findById(postulanteId)
      .populate('usuarioId', 'nombre apellidos email')
      .lean();

    if (!postulante) throw new NotFoundException('Postulante no encontrado');

    const user = postulante.usuarioId as any;
    const cvActual =
      await this.documentosService.obtenerCVPostulante(postulanteId);

    const docsPersonales = await this.docPersonalModel
      .find({ postulanteId: postulante._id })
      .select('tipo')
      .lean();

    const tiposDP = new Set(docsPersonales.map((d) => d.tipo as string));
    const tieneCV = Boolean(cvActual);
    const tieneVacante = Boolean(postulante.vacante?.trim());

    const cumplidos = new Set<string>(tiposDP);
    if (tieneCV) cumplidos.add('cv');
    if (tieneVacante) cumplidos.add('vacante');

    // Solo requisitos obligatorios cuentan para "Falta: ..." y el % de
    // avance (ej. la vacuna de fiebre amarilla es opcional).
    const requisitosObligatorios = REQUISITOS_EXPEDIENTE.filter(
      (r) => r.requerido,
    );
    const requisitosFaltantes = requisitosObligatorios
      .filter((r) => !cumplidos.has(r.clave))
      .map((r) => r.label);

    const porcentajeExpediente = Math.round(
      ((requisitosObligatorios.length - requisitosFaltantes.length) /
        requisitosObligatorios.length) *
        100,
    );

    const estadoGuardado: 'en_proceso' | 'enviado' =
      postulante.estadoExpediente ?? 'en_proceso';
    const estadoExpediente = resolverEstadoExpediente(
      porcentajeExpediente,
      estadoGuardado,
    );

    let enviadoEn = postulante.enviadoEn;
    if (estadoExpediente !== estadoGuardado) {
      enviadoEn = undefined;
      await this.postulanteModel.updateOne(
        { _id: postulante._id },
        { $set: { estadoExpediente: 'en_proceso' }, $unset: { enviadoEn: '' } },
      );
    }

    const evaluacionesDocs = await this.evaluacionModel
      .find({
        postulanteId: postulante._id,
        documentoClave: { $ne: DOCUMENTO_CLAVE_LEGADO },
      })
      .select('documentoClave')
      .lean();
    const docsEvaluados = new Set(evaluacionesDocs.map((e) => e.documentoClave))
      .size;
    const docsTotal = CLAVES_REQUISITO.length;

    return {
      postulanteId: String(postulante._id),
      usuarioId: String(user?._id),
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      email: user?.email ?? '',
      telefono: postulante.telefono,
      ciudad: postulante.ciudad,
      pais: postulante.pais,
      linkedinUrl: postulante.linkedinUrl,
      vacante: postulante.vacante,
      estadoPostulacion: postulante.estadoPostulacion,
      estadoExpediente,
      enviadoEn,
      porcentajeExpediente,
      requisitosFaltantes,
      semaforoClave: calcularSemaforo(
        tieneCV,
        tieneVacante,
        porcentajeExpediente,
        estadoExpediente,
      ),
      docsEvaluados,
      docsTotal,
      estadoEvaluacion: calcularEstadoEvaluacion(docsEvaluados, docsTotal),
      cvActual: cvActual
        ? {
            id: cvActual._id,
            nombreOriginal: cvActual.nombreOriginal,
            tamanio: cvActual.tamanio,
            version: cvActual.version,
            subidasEn: cvActual.subidasEn,
            urlDescargar: cvActual.urlDescargar,
            storageType: cvActual.storageType,
          }
        : null,
    };
  }

  async listarComentarios(postulanteId: string): Promise<EvaluacionItemDto[]> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const evaluaciones = await this.evaluacionModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .populate('evaluadorId', 'nombre apellidos')
      .sort({ creadoEn: -1 })
      .lean();

    return evaluaciones.map((item: any) => this.toEvaluacionItemDto(item));
  }

  async listarEvaluacionesPorDocumento(
    postulanteId: string,
  ): Promise<EvaluacionDocumentoDto[]> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const evaluaciones = await this.evaluacionModel
      .find({
        postulanteId: new Types.ObjectId(postulanteId),
        documentoClave: { $ne: DOCUMENTO_CLAVE_LEGADO },
      })
      .populate('evaluadorId', 'nombre apellidos')
      .sort({ creadoEn: -1 })
      .lean();

    const porClave = new Map<string, EvaluacionItemDto[]>();
    for (const item of evaluaciones as any[]) {
      const clave = item.documentoClave;
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave)!.push(this.toEvaluacionItemDto(item));
    }

    return REQUISITOS_EXPEDIENTE.map((requisito) => {
      const historial = porClave.get(requisito.clave) ?? [];
      return {
        documentoClave: requisito.clave,
        label: requisito.label,
        ultimaEvaluacion: historial[0] ?? null,
        historial,
      };
    });
  }

  private toEvaluacionItemDto(item: any): EvaluacionItemDto {
    return {
      id: String(item._id),
      documentoClave: item.documentoClave,
      comentario: item.comentario,
      calificacion: item.calificacion,
      estadoSugerido: item.estadoSugerido,
      resultadoEvaluacion: item.resultadoEvaluacion,
      fechaEvaluacion: item.fechaEvaluacion ?? item.creadoEn,
      evaluadorId: String(item.evaluadorId?._id ?? ''),
      evaluadorNombre:
        item.nombreEvaluador ??
        `${item.evaluadorId?.nombre ?? ''} ${item.evaluadorId?.apellidos ?? ''}`.trim(),
      creadoEn: item.creadoEn,
    };
  }

  async listarMisComentarios(userId: string): Promise<EvaluacionItemDto[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('ID de usuario inválido');
    }

    const postulante = await this.postulanteModel
      .findOne({ usuarioId: new Types.ObjectId(userId) })
      .select('_id')
      .lean();

    if (!postulante) {
      throw new NotFoundException('Perfil de postulante no encontrado');
    }

    return this.listarComentarios(String(postulante._id));
  }

  /**
   * Evalúa un documento puntual del expediente. Append-only y sin candado:
   * cualquier evaluador puede evaluar o re-evaluar cualquier documento en
   * cualquier momento; el historial completo se conserva (ver
   * listarEvaluacionesPorDocumento). No toca estadoPostulacion — la decisión
   * final del candidato es una acción aparte (ver decidirCandidato).
   */
  async evaluarDocumento(
    postulanteId: string,
    evaluadorUserId: string,
    dto: CrearEvaluacionDto,
    ipAddress?: string,
  ): Promise<EvaluacionItemDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }
    if (!CLAVES_REQUISITO.includes(dto.documentoClave as never)) {
      throw new BadRequestException('documentoClave inválida');
    }

    const postulante = await this.postulanteModel.findById(postulanteId);
    if (!postulante) throw new NotFoundException('Postulante no encontrado');

    const evaluador = await this.usuarioModel.findById(evaluadorUserId);
    if (!evaluador) throw new NotFoundException('Evaluador no encontrado');

    const nombreEvaluador = `${evaluador.nombre} ${evaluador.apellidos}`.trim();
    const fechaEvaluacion = new Date();

    const evaluacion = await this.evaluacionModel.create({
      postulanteId: new Types.ObjectId(postulanteId),
      evaluadorId: new Types.ObjectId(evaluadorUserId),
      documentoClave: dto.documentoClave,
      comentario: dto.comentario,
      calificacion: dto.calificacion,
      estadoSugerido: dto.estadoSugerido ?? 'en_proceso',
      resultadoEvaluacion: dto.resultadoEvaluacion,
      nombreEvaluador,
      fechaEvaluacion,
    });

    await this.auditoria.registrar({
      actorId: evaluadorUserId,
      actorEmail: evaluador.email,
      accion: 'evaluaciones.documento_evaluado',
      recurso: 'postulante',
      recursoId: postulanteId,
      ipAddress,
      metadata: {
        documentoClave: dto.documentoClave,
        resultadoEvaluacion: dto.resultadoEvaluacion,
        calificacion: dto.calificacion,
      },
    });

    return this.toEvaluacionItemDto({
      ...evaluacion.toObject(),
      evaluadorId: { _id: evaluador._id },
    });
  }

  /**
   * Decisión final del candidato (aprobado/rechazado/en proceso), separada
   * de las evaluaciones por documento. Fija estadoPostulacion y notifica al
   * postulante por correo, igual que antes hacía crearComentario.
   */
  async decidirCandidato(
    postulanteId: string,
    evaluadorUserId: string,
    dto: DecidirCandidatoDto,
    ipAddress?: string,
  ): Promise<CandidatoDetalleDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const postulante = await this.postulanteModel
      .findById(postulanteId)
      .populate<{
        usuarioId: UsuarioDocument;
      }>('usuarioId', 'nombre apellidos email');
    if (!postulante) throw new NotFoundException('Postulante no encontrado');

    const evaluador = await this.usuarioModel.findById(evaluadorUserId);
    if (!evaluador) throw new NotFoundException('Evaluador no encontrado');

    const estadoAnterior = postulante.estadoPostulacion;
    postulante.estadoPostulacion = dto.decision;
    await postulante.save();

    await this.auditoria.registrar({
      actorId: evaluadorUserId,
      actorEmail: evaluador.email,
      accion: 'evaluaciones.decision_candidato',
      recurso: 'postulante',
      recursoId: postulanteId,
      ipAddress,
      metadata: { estadoAnterior, estadoNuevo: dto.decision },
    });

    const usuarioPostulante = postulante.usuarioId;
    if (usuarioPostulante?.email) {
      try {
        const frontendUrl = this.config.get(
          'FRONTEND_URL',
          'http://localhost:3000',
        );
        await this.notificaciones.enviarNotificacionCambioEstado(
          usuarioPostulante.email,
          usuarioPostulante.nombre,
          dto.decision,
          `${frontendUrl}/estado`,
        );
      } catch (err) {
        this.logger.error(
          `Error enviando cambio de estado a ${usuarioPostulante.email}: ${(err as Error).message}`,
        );
      }
    }

    return this.obtenerCandidato(postulanteId);
  }
}

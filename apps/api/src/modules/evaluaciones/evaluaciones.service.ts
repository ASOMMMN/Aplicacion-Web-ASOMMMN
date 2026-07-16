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
import {
  CandidatoDetalleDto,
  CandidatoListaItemDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
} from './dto/evaluaciones-response.dto';
import { Evaluacion, EvaluacionDocument } from './schemas/evaluacion.schema';
import {
  REQUISITOS_EXPEDIENTE,
  calcularSemaforo,
  resolverEstadoExpediente,
} from '../postulantes/constants/expediente.constants';

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

    const [cvsActuales, docsPersonalesList] = await Promise.all([
      this.documentoModel
        .find({ postulanteId: { $in: postulanteIds }, esActual: true })
        .select('postulanteId version subidasEn')
        .lean(),
      this.docPersonalModel
        .find({ postulanteId: { $in: postulanteIds } })
        .select('postulanteId tipo')
        .lean(),
    ]);

    const cvByPostulante = new Map<string, { version: number; subidasEn: Date }>();
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
      dpByPostulante.get(key)!.add(dp.tipo as string);
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

      const requisitosFaltantes = REQUISITOS_EXPEDIENTE.filter(
        (r) => !cumplidos.has(r.clave),
      ).map((r) => r.label);

      const porcentajeExpediente = Math.round(
        ((REQUISITOS_EXPEDIENTE.length - requisitosFaltantes.length) /
          REQUISITOS_EXPEDIENTE.length) *
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

    const requisitosFaltantes = REQUISITOS_EXPEDIENTE.filter(
      (r) => !cumplidos.has(r.clave),
    ).map((r) => r.label);

    const porcentajeExpediente = Math.round(
      ((REQUISITOS_EXPEDIENTE.length - requisitosFaltantes.length) /
        REQUISITOS_EXPEDIENTE.length) *
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
      cvActual: cvActual
        ? {
            id: cvActual._id,
            nombreOriginal: cvActual.nombreOriginal,
            tamanio: cvActual.tamanio,
            version: cvActual.version,
            subidasEn: cvActual.subidasEn,
            urlDescargar: cvActual.urlDescargar,
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

    return evaluaciones.map((item: any) => ({
      id: String(item._id),
      comentario: item.comentario,
      calificacion: item.calificacion,
      estadoSugerido: item.estadoSugerido,
      evaluadorId: String(item.evaluadorId?._id ?? ''),
      evaluadorNombre:
        `${item.evaluadorId?.nombre ?? ''} ${item.evaluadorId?.apellidos ?? ''}`.trim(),
      creadoEn: item.creadoEn,
    }));
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

  async crearComentario(
    postulanteId: string,
    evaluadorUserId: string,
    dto: CrearEvaluacionDto,
    ipAddress?: string,
  ): Promise<EvaluacionItemDto> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new BadRequestException('ID de postulante inválido');
    }

    const postulante = await this.postulanteModel
      .findById(postulanteId)
      .populate<{ usuarioId: UsuarioDocument }>('usuarioId', 'nombre apellidos email');
    if (!postulante) throw new NotFoundException('Postulante no encontrado');

    const evaluador = await this.usuarioModel.findById(evaluadorUserId);
    if (!evaluador) throw new NotFoundException('Evaluador no encontrado');

    const estadoAnterior = postulante.estadoPostulacion;

    const evaluacion = await this.evaluacionModel.create({
      postulanteId: new Types.ObjectId(postulanteId),
      evaluadorId: new Types.ObjectId(evaluadorUserId),
      comentario: dto.comentario,
      calificacion: dto.calificacion,
      estadoSugerido: dto.estadoSugerido ?? 'en_proceso',
    });

    if (dto.estadoSugerido) {
      postulante.estadoPostulacion = dto.estadoSugerido;
      await postulante.save();
    }

    await this.auditoria.registrar({
      actorId: evaluadorUserId,
      actorEmail: evaluador.email,
      accion: 'evaluaciones.comentario_creado',
      recurso: 'postulante',
      recursoId: postulanteId,
      ipAddress,
      metadata: {
        estadoAnterior,
        estadoNuevo: dto.estadoSugerido ?? estadoAnterior,
        calificacion: dto.calificacion,
      },
    });

    const usuarioPostulante = postulante.usuarioId as unknown as UsuarioDocument;

    if (dto.estadoSugerido && dto.estadoSugerido !== estadoAnterior) {
      if (usuarioPostulante?.email) {
        try {
          await this.notificaciones.enviarNotificacionCambioEstado(
            usuarioPostulante.email,
            usuarioPostulante.nombre,
            dto.estadoSugerido,
          );
        } catch (err) {
          this.logger.error(
            `Error enviando cambio de estado a ${usuarioPostulante.email}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (usuarioPostulante?.email) {
      try {
        const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
        await this.notificaciones.enviarAvisoComentarioNuevo(
          usuarioPostulante.email,
          usuarioPostulante.nombre,
          `${frontendUrl}/estado`,
        );
      } catch (err) {
        this.logger.error(
          `Error enviando aviso de comentario nuevo a ${usuarioPostulante.email}: ${(err as Error).message}`,
        );
      }
    }

    return {
      id: String(evaluacion._id),
      comentario: evaluacion.comentario,
      calificacion: evaluacion.calificacion,
      estadoSugerido: evaluacion.estadoSugerido,
      evaluadorId: String(evaluador._id),
      evaluadorNombre: `${evaluador.nombre} ${evaluador.apellidos}`.trim(),
      creadoEn: evaluacion.creadoEn,
    };
  }
}

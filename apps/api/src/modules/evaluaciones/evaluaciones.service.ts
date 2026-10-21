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
  CandidatosPaginadosDto,
  EvaluacionDocumentoDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
  ResumenCandidatosDto,
} from './dto/evaluaciones-response.dto';
import {
  ExportarCandidatosQueryDto,
  FiltrosCandidatosDto,
  ListarCandidatosQueryDto,
  OrigenEliminacionCandidato,
  ResumenCandidatosQueryDto,
  VistaCandidatos,
} from './dto/listar-candidatos-query.dto';
import {
  estadoGeneral,
  ESTADO_GENERAL_LABEL,
} from './utils/estado-candidato.util';
import {
  filtrarOrdenarCandidatos,
  FiltrosCandidatosNormalizados,
} from './utils/filtrar-ordenar-candidatos.util';
import { filaCsvSegura } from '../../common/utils/csv.util';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { Evaluacion, EvaluacionDocument } from './schemas/evaluacion.schema';
import {
  CLAVES_REQUISITO,
  REQUISITOS_EXPEDIENTE,
  calcularSemaforo,
  resolverEstadoExpediente,
} from '../postulantes/constants/expediente.constants';
import { demoverSiExpedienteIncompleto } from '../postulantes/utils/sincronizar-estado-expediente.util';

const DOCUMENTO_CLAVE_LEGADO = 'general';

const MAPA_ORIGEN_ELIMINACION: Record<string, OrigenEliminacionCandidato> = {
  ADMIN: 'admin',
  EVALUADOR: 'admin',
  SELF: 'self',
  SYSTEM: 'desconocido',
};

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

  /**
   * 'activos' (default) excluye eliminados; 'papelera' muestra solo
   * eliminados y requiere rol administrador — valida del lado del servidor,
   * no es solo un filtro de UI (un evaluador no debe poder ver la papelera
   * ni mandando el query param a mano).
   */
  private resolverVista(
    vistaSolicitada: VistaCandidatos | undefined,
    actor?: AuthUser,
  ): VistaCandidatos {
    const vista = vistaSolicitada ?? 'activos';
    if (vista === 'papelera' && actor?.rol !== 'administrador') {
      throw new ForbiddenException(
        'Solo un administrador puede ver la papelera.',
      );
    }
    return vista;
  }

  /** Mapea los filtros compartidos del DTO a la forma que espera la función pura. */
  private baseFiltros(
    query: FiltrosCandidatosDto,
  ): Omit<FiltrosCandidatosNormalizados, 'ordenarPor' | 'direccion'> {
    return {
      q: query.q,
      vacante: query.vacante,
      estado: query.estado,
      fechaDesde: query.fechaDesde,
      fechaHasta: query.fechaHasta,
      actividadAntesDe: query.actividadAntesDe,
      avance: query.avance,
      docs: query.docs,
    };
  }

  async listarCandidatos(
    query: ListarCandidatosQueryDto = new ListarCandidatosQueryDto(),
    actor?: AuthUser,
  ): Promise<CandidatosPaginadosDto> {
    const vista = this.resolverVista(query.vista, actor);
    if (query.ordenarPor === 'eliminadoEn' && vista !== 'papelera') {
      throw new BadRequestException(
        'ordenarPor=eliminadoEn solo es válido con vista=papelera.',
      );
    }

    const { items, enviadoEnPorPostulante } = await this.construirCandidatos();

    const { data: ordenado, total, conteos } = filtrarOrdenarCandidatos(
      items,
      {
        ...this.baseFiltros(query),
        ordenarPor: query.ordenarPor,
        direccion: query.direccion,
      },
      vista,
      query.origenEliminacion,
      enviadoEnPorPostulante,
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const inicio = (page - 1) * limit;
    const esAdmin = actor?.rol === 'administrador';
    const data = ordenado
      .slice(inicio, inicio + limit)
      .map((item) => (esAdmin ? item : this.ocultarEliminadoPor(item)));

    return {
      data,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      conteos,
    };
  }

  /** Solo ADMIN puede ver quién eliminó a un usuario (nombre/email del actor). */
  private ocultarEliminadoPor(
    item: CandidatoListaItemDto,
  ): CandidatoListaItemDto {
    const { eliminadoPorNombre, eliminadoPorEmail, ...resto } = item;
    return resto as CandidatoListaItemDto;
  }

  async resumenCandidatos(
    query: ResumenCandidatosQueryDto = new ResumenCandidatosQueryDto(),
    actor?: AuthUser,
  ): Promise<ResumenCandidatosDto> {
    const vista = this.resolverVista(query.vista, actor);
    const { items, enviadoEnPorPostulante } = await this.construirCandidatos();

    // El desglose por estado ignora `estado` a propósito — igual que hoy,
    // /resumen siempre refleja la distribución completa (vista + resto de
    // filtros), nunca colapsa a un solo bucket cuando se filtra por estado.
    const { total, conteos } = filtrarOrdenarCandidatos(
      items,
      { ...this.baseFiltros(query), estado: undefined },
      vista,
      query.origenEliminacion,
      enviadoEnPorPostulante,
    );

    const resumen: ResumenCandidatosDto = { ...conteos, total };

    // Contador del botón Papelera: total de eliminados que matchean q/vacante,
    // sin importar la vista actual. Solo se calcula (y expone) para admin.
    if (actor?.rol === 'administrador') {
      resumen.eliminados = filtrarOrdenarCandidatos(
        items,
        { q: query.q, vacante: query.vacante },
        'papelera',
        undefined,
        enviadoEnPorPostulante,
      ).total;
    }

    return resumen;
  }

  /** Catálogo de vacantes distintas (no vacías) para el multiselect del frontend. */
  async listarVacantesDistintas(): Promise<string[]> {
    const valores = await this.postulanteModel.distinct('vacante', {
      vacante: { $exists: true, $nin: [null, ''] },
    });
    return (valores as string[]).sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** Máximo de filas por exportación, por abuso/tamaño de respuesta razonable. */
  private static readonly MAX_FILAS_EXPORT = 5000;

  async exportarCandidatosCSV(
    query: ExportarCandidatosQueryDto,
    actor: AuthUser,
    ip?: string,
  ): Promise<{ filename: string; csv: string }> {
    const vista = this.resolverVista(query.vista, actor);
    const { items, enviadoEnPorPostulante } = await this.construirCandidatos();
    const { data } = filtrarOrdenarCandidatos(
      items,
      this.baseFiltros(query),
      vista,
      query.origenEliminacion,
      enviadoEnPorPostulante,
    );
    const filtrado = data.slice(0, EvaluacionesService.MAX_FILAS_EXPORT);
    const esAdmin = actor.rol === 'administrador';

    const encabezados = [
      'Nombre',
      'Email',
      'Vacante',
      'Ciudad',
      'País',
      'Estado',
      '% Avance',
      'Docs evaluados',
      'Docs totales',
      'Fecha de postulación',
      'Última actividad',
      'Eliminado',
      'Origen eliminación',
      'Fecha de eliminación',
      ...(esAdmin ? ['Eliminado por'] : []),
    ];
    const filas = filtrado.map((item) => {
      const estado = item.estadoGeneral;
      const ORIGEN_LABEL: Record<string, string> = {
        admin: 'Admin',
        self: 'El propio usuario',
        desconocido: 'Desconocido',
      };
      return filaCsvSegura([
        item.nombreCompleto,
        item.email || `ID: ${item.postulanteId.slice(-8)}`,
        item.vacante ?? '',
        item.ciudad ?? '',
        item.pais ?? '',
        ESTADO_GENERAL_LABEL[estado],
        String(item.porcentajeExpediente),
        String(item.docsEvaluados ?? 0),
        String(item.docsTotal ?? 0),
        item.creadoEn ? new Date(item.creadoEn).toISOString().slice(0, 10) : '',
        item.actualizadoEn
          ? new Date(item.actualizadoEn).toISOString().slice(0, 10)
          : '',
        item.eliminado ? 'Sí' : 'No',
        item.eliminado && item.eliminadoOrigen
          ? (ORIGEN_LABEL[item.eliminadoOrigen] ?? item.eliminadoOrigen)
          : '',
        item.eliminadoEn
          ? new Date(item.eliminadoEn).toISOString().slice(0, 10)
          : '',
        ...(esAdmin
          ? [item.eliminadoPorNombre || item.eliminadoPorEmail || '']
          : []),
      ]);
    });

    const csv = [filaCsvSegura(encabezados), ...filas].join('\r\n');
    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `candidatos_${fecha}.csv`;

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'candidatos_exportar_csv',
      recurso: 'Postulante',
      ipAddress: ip,
      metadata: {
        filtros: {
          estado: query.estado,
          vacante: query.vacante,
          q: query.q,
          vista,
          origenEliminacion: query.origenEliminacion,
        },
        cantidadExportada: filtrado.length,
      },
    });

    const BOM = String.fromCharCode(0xfeff);
    return { filename, csv: `${BOM}${csv}` };
  }

  private async construirCandidatos(): Promise<{
    items: CandidatoListaItemDto[];
    enviadoEnPorPostulante: Map<string, Date | undefined>;
  }> {
    const postulantes = await this.postulanteModel
      .find()
      .populate({
        path: 'usuarioId',
        select:
          'nombre apellidos email isDeleted deletedAt deletedByRole deletionReason deletedSnapshot deletedBy',
        populate: { path: 'deletedBy', select: 'nombre apellidos email' },
      })
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

    // Solo para el orden por defecto (enviados sin evaluar, por fecha de
    // envío ascendente); no es parte del DTO público de CandidatoListaItemDto.
    const enviadoEnPorPostulante = new Map<string, Date | undefined>();

    const resultado = postulantes.map((p: any) => {
      enviadoEnPorPostulante.set(String(p._id), p.enviadoEn);
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

      // Nota de solo-lectura: si el % de avance ya no sostiene un
      // estadoExpediente='enviado' guardado, aquí se refleja ya corregido
      // para la respuesta, pero la persistencia de esa corrección ocurre en
      // los puntos de escritura que pueden invalidarla (ver
      // sincronizar-estado-expediente.util.ts), no en esta lectura.
      const estadoGuardado: 'en_proceso' | 'enviado' =
        p.estadoExpediente ?? 'en_proceso';
      const estadoExpediente = resolverEstadoExpediente(
        porcentajeExpediente,
        estadoGuardado,
      );

      const docsEvaluados =
        docsEvaluadosByPostulante.get(String(p._id))?.size ?? 0;
      const docsTotal = CLAVES_REQUISITO.length;

      const estadoEvaluacion = calcularEstadoEvaluacion(
        docsEvaluados,
        docsTotal,
      );

      // populate() deja usuarioId en null cuando el usuario referenciado ya
      // no existe. Desde que existe soft-delete esto solo pasa con cuentas
      // borradas físicamente ANTES de esta función (ver legacyEliminacion,
      // reconstruido por scripts/reconstruir-eliminaciones-legacy.ts); de aquí
      // en adelante una cuenta eliminada sigue existiendo con isDeleted=true.
      let nombre = user?.nombre ?? '';
      let apellidos = user?.apellidos ?? '';
      let email = user?.email ?? '';
      let eliminado = false;
      let eliminadoOrigen: OrigenEliminacionCandidato | undefined;
      let eliminadoEn: Date | undefined;
      let eliminadoMotivo: string | undefined;
      let eliminadoPorNombre: string | undefined;
      let eliminadoPorEmail: string | undefined;

      if (user?.isDeleted) {
        eliminado = true;
        const snap = user.deletedSnapshot;
        if (snap) {
          nombre = snap.nombre ?? nombre;
          apellidos = snap.apellidos ?? apellidos;
          email = snap.email ?? email;
        }
        eliminadoEn = user.deletedAt;
        eliminadoMotivo = user.deletionReason;
        eliminadoOrigen =
          MAPA_ORIGEN_ELIMINACION[user.deletedByRole as string] ?? 'desconocido';
        const deletedByUser = user.deletedBy;
        if (deletedByUser) {
          eliminadoPorNombre =
            `${deletedByUser.nombre ?? ''} ${deletedByUser.apellidos ?? ''}`.trim();
          eliminadoPorEmail = deletedByUser.email;
        }
      } else if (!user) {
        eliminado = true;
        const legacy = p.legacyEliminacion;
        if (legacy?.detectado) {
          nombre = legacy.nombre ?? '';
          apellidos = legacy.apellidos ?? '';
          email = legacy.email ?? '';
          eliminadoEn = legacy.deletedAt;
          eliminadoMotivo = legacy.motivo;
          eliminadoOrigen = legacy.origen;
          eliminadoPorNombre = legacy.deletedByNombre;
          eliminadoPorEmail = legacy.deletedByEmail;
        } else {
          eliminadoOrigen = 'desconocido';
        }
      }

      const nombreCompleto =
        nombre || apellidos ? `${nombre} ${apellidos}`.trim() : 'Usuario eliminado';

      const estadoGeneralItem = estadoGeneral({
        porcentajeExpediente,
        estadoExpediente,
        estadoEvaluacion,
      });

      return {
        postulanteId: String(p._id),
        nombreCompleto,
        nombre,
        apellidos,
        email,
        eliminado,
        eliminadoOrigen,
        eliminadoEn,
        eliminadoMotivo,
        eliminadoPorNombre,
        eliminadoPorEmail,
        estadoPostulacion: p.estadoPostulacion,
        ciudad: p.ciudad,
        pais: p.pais,
        vacante: p.vacante,
        tieneCV,
        versionCV: cv?.version,
        creadoEn: p.creadoEn,
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
        estadoEvaluacion,
        estadoGeneral: estadoGeneralItem,
      };
    });

    return { items: resultado, enviadoEnPorPostulante };
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
    const estadoExpediente = await demoverSiExpedienteIncompleto(
      this.postulanteModel,
      postulante._id,
      porcentajeExpediente,
      estadoGuardado,
    );

    const enviadoEn =
      estadoExpediente === estadoGuardado ? postulante.enviadoEn : undefined;

    const evaluacionesDocs = await this.evaluacionModel
      .find({
        postulanteId: postulante._id,
        documentoClave: { $ne: DOCUMENTO_CLAVE_LEGADO },
      })
      .select('documentoClave')
      .lean();
    // Defensivo: si algún registro llegara sin documentoClave (legado no
    // migrado), no cuenta como documento evaluado. Ver mismo guard en
    // listarCandidatos.
    const docsEvaluados = new Set(
      evaluacionesDocs
        .map((e) => e.documentoClave)
        .filter((clave): clave is string => Boolean(clave)),
    ).size;
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
            tipoMime: cvActual.tipoMime,
            urlDescargar: cvActual.urlDescargar,
            urlVista: cvActual.urlVista,
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

    // TEMP debug — quitar una vez confirmado en producción que las
    // evaluaciones por documento persisten sin el error de índice único.
    this.logger.debug(
      `[TEMP] evaluarDocumento: postulanteId=${postulanteId} documentoClave=${dto.documentoClave} resultadoEvaluacion=${dto.resultadoEvaluacion}`,
    );

    let evaluacion: EvaluacionDocument;
    try {
      evaluacion = await this.evaluacionModel.create({
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
    } catch (err) {
      this.logger.error(
        `[TEMP] evaluarDocumento: create() falló para postulanteId=${postulanteId} documentoClave=${dto.documentoClave}: ${(err as Error).message}`,
      );
      throw err;
    }

    this.logger.debug(
      `[TEMP] evaluarDocumento: guardado id=${evaluacion._id.toString()}`,
    );

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

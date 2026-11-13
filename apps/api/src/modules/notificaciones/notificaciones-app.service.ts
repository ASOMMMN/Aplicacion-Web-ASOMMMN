import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types, type QueryFilter } from 'mongoose';

import {
  DecisionExpediente,
  NotificacionApp,
  NotificacionAppDocument,
  TipoNotificacionApp,
} from './schemas/notificacion-app.schema';
import {
  FiltroNotificacionesApp,
  GrupoNotificacionesAppDto,
  ListaNotificacionesAppDto,
  LIMITE_NOTIFICACIONES_DEFAULT,
  LIMITE_NOTIFICACIONES_MAX,
  MarcarTodasAppDto,
  MAX_AVISOS_POR_GRUPO,
  NotificacionAppItemDto,
  OpcionesListarNotificacionesApp,
} from './dto/notificacion-app.dto';
import { DiagnosticoNotificacionesAppDto } from './dto/diagnostico-notificaciones-app.dto';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { REQUISITOS_EXPEDIENTE } from '../postulantes/constants/expediente.constants';
import { DocumentoSchema } from '../documentos/schemas/documento.schema';
import { DocPersonalSchema } from '../docs-personales/schemas/doc-personal.schema';
import { CursoSchema } from '../cursos/schemas/curso.schema';

/**
 * `rol` de los destinatarios. El esquema, los guards y el JWT usan
 * 'evaluador' y 'administrador' en minúsculas, pero una cuenta creada a mano
 * o por un script viejo puede traer otra capitalización, espacios o "admin".
 * Avisarle a esa cuenta no cuesta nada; dejarla fuera la deja sin campanita.
 */
export const PATRON_ROL_DESTINATARIO =
  /^\s*(evaluador|administrador|admin)\s*$/i;

/** Días y "hoy" de la campanita se cuentan en hora de México. */
export const ZONA_HORARIA_AVISOS = 'America/Mexico_City';
/** documento_subido: subidas del mismo candidato dentro de esta ventana se juntan. */
export const VENTANA_DOCUMENTOS_MS = 10 * 60 * 1000;
/** candidato_inactivo: días sin actividad para avisar. */
export const DIAS_INACTIVIDAD = 7;
/** Etiquetas que se guardan por aviso de documento_subido (las últimas). */
export const MAX_DOCUMENTOS_EN_AVISO = 10;

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Filtro de destinatarios de la campanita (y de los correos a evaluadores).
 * Solo excluye cuentas eliminadas: no exige `estadoCuenta`, `emailVerificado`
 * ni ningún otro campo, para no dejar fuera cuentas antiguas o del seed que
 * no los tienen. `isDeleted: { $ne: true }` también acepta el campo ausente.
 */
export function filtroDestinatariosApp(): QueryFilter<UsuarioDocument> {
  return {
    rol: { $regex: PATRON_ROL_DESTINATARIO },
    isDeleted: { $ne: true },
  };
}

type IdLike = Types.ObjectId | string;
type Destinatario = { _id: Types.ObjectId; rol?: string };

function aObjectId(id: IdLike): Types.ObjectId {
  return id instanceof Types.ObjectId ? id : new Types.ObjectId(id);
}

function esClaveDuplicada(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

/** "código 11000 MongoServerError: ..." (sin datos del candidato). */
function describirError(err: unknown): string {
  const e = err as { code?: number; name?: string; message?: string };
  const codigo = e?.code !== undefined ? `código ${e.code} ` : '';
  return `${codigo}${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`;
}

/** { evaluador: 2, administrador: 1 } según el `rol` tal como está guardado. */
function contarPorRol(usuarios: { rol?: string }[]): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const u of usuarios) {
    const rol = String(u.rol ?? '(sin rol)');
    conteo[rol] = (conteo[rol] ?? 0) + 1;
  }
  return conteo;
}

function formatearConteo(conteo: Record<string, number>): string {
  return Object.entries(conteo)
    .map(([rol, n]) => `${rol}: ${n}`)
    .join(', ');
}

function nombreCompleto(u?: { nombre?: string; apellidos?: string } | null) {
  return `${u?.nombre ?? ''} ${u?.apellidos ?? ''}`.trim();
}

// ── Textos ──────────────────────────────────────────────────────────────────

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "AAAA-MM-DD" del calendario de México para esa fecha. */
export function diaMexico(fecha: Date): string {
  // en-CA da el formato ISO (AAAA-MM-DD).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_AVISOS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

/** Día anterior de un "AAAA-MM-DD" (aritmética de calendario, sin horas). */
function diaAnterior(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** "hoy", "ayer", "el 3 nov" o "el 3 nov 2025". */
export function etiquetaDia(dia: string, ahora: Date = new Date()): string {
  const hoy = diaMexico(ahora);
  if (dia === hoy) return 'hoy';
  if (dia === diaAnterior(hoy)) return 'ayer';
  const [a, m, d] = dia.split('-').map(Number);
  const mismoAnio = String(a) === hoy.slice(0, 4);
  return `el ${d} ${MESES_CORTOS[m - 1] ?? ''}${mismoAnio ? '' : ` ${a}`}`;
}

const SUSTANTIVO_GRUPO: Record<TipoNotificacionApp, [string, string]> = {
  nuevo_candidato: ['postulante nuevo', 'postulantes nuevos'],
  expediente_completo: ['expediente completo', 'expedientes completos'],
  documento_subido: [
    'candidato subió documentos',
    'candidatos subieron documentos',
  ],
  expediente_evaluado: ['expediente evaluado', 'expedientes evaluados'],
  candidato_inactivo: ['candidato inactivo', 'candidatos inactivos'],
};

/** "5 postulantes nuevos hoy", "1 expediente evaluado ayer"... */
export function resumenGrupo(
  tipo: TipoNotificacionApp,
  cantidad: number,
  dia: string,
  ahora: Date = new Date(),
): string {
  const [uno, varios] = SUSTANTIVO_GRUPO[tipo] ?? ['aviso', 'avisos'];
  return `${cantidad} ${cantidad === 1 ? uno : varios} ${etiquetaDia(dia, ahora)}`;
}

function listaDocumentos(documentos: string[] | undefined): string {
  const unicos = [...new Set((documentos ?? []).filter(Boolean))];
  if (unicos.length === 0) return '';
  const visibles = unicos.slice(0, 3);
  const resto = unicos.length - visibles.length;
  return resto > 0
    ? `${visibles.join(', ')} y ${resto} más`
    : visibles.join(', ');
}

export function diasInactivo(
  inactivoDesde: Date | undefined,
  creadaEn: Date,
): number | undefined {
  if (!inactivoDesde) return undefined;
  const dias = Math.floor(
    (new Date(creadaEn).getTime() - new Date(inactivoDesde).getTime()) / MS_DIA,
  );
  return Math.max(DIAS_INACTIVIDAD, dias);
}

export type DatosMensajeNotificacionApp = {
  tipo: TipoNotificacionApp;
  nombreCandidato: string;
  cantidad?: number;
  documentos?: string[];
  decision?: DecisionExpediente;
  actorNombre?: string;
  inactivoDesde?: Date;
  creadaEn?: Date;
};

export function mensajeNotificacionApp(d: DatosMensajeNotificacionApp): string {
  const quien = d.nombreCandidato;
  switch (d.tipo) {
    case 'nuevo_candidato':
      return `${quien} se registró como postulante.`;
    case 'expediente_completo':
      return `${quien} completó su expediente (100 %).`;
    case 'documento_subido': {
      const n = Math.max(1, d.cantidad ?? 1);
      const lista = listaDocumentos(d.documentos);
      const base =
        n === 1
          ? `${quien} subió un documento`
          : `${quien} subió ${n} documentos`;
      return lista ? `${base}: ${lista}.` : `${base}.`;
    }
    case 'expediente_evaluado': {
      const actor = d.actorNombre?.trim() || 'Otro evaluador';
      if (d.decision === 'completado') return `${actor} aprobó a ${quien}.`;
      if (d.decision === 'rechazado') return `${actor} rechazó a ${quien}.`;
      return `${actor} regresó a ${quien} a "En proceso".`;
    }
    case 'candidato_inactivo': {
      const dias =
        diasInactivo(d.inactivoDesde, d.creadaEn ?? new Date()) ??
        DIAS_INACTIVIDAD;
      return `${quien} lleva ${dias} días sin actividad y su expediente está incompleto.`;
    }
    default:
      return `${quien}: aviso nuevo.`;
  }
}

// ── Inactividad (cálculo puro) ──────────────────────────────────────────────

const CLAVES_REQUERIDAS: string[] = REQUISITOS_EXPEDIENTE.filter(
  (r) => r.requerido,
).map((r) => r.clave);

/** Igual que calcularProgreso, pero sin escribir nada. */
export function expedienteIncompleto(datos: {
  tieneCV: boolean;
  tiposDocs: string[];
  vacante?: string | null;
}): boolean {
  const cumplidos = new Set<string>(datos.tiposDocs);
  if (datos.tieneCV) cumplidos.add('cv');
  if (datos.vacante?.trim()) cumplidos.add('vacante');
  return CLAVES_REQUERIDAS.some((c) => !cumplidos.has(c));
}

/** La fecha más reciente (ignora vacías e inválidas). */
export function ultimaFecha(
  ...fechas: (Date | string | null | undefined)[]
): Date | null {
  let max: number | null = null;
  for (const f of fechas) {
    if (!f) continue;
    const t = new Date(f).getTime();
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max === null ? null : new Date(max);
}

type ResultadoCrear = 'creada' | 'duplicada' | 'sin_destinatarios';

type CamposExtra = Partial<
  Pick<
    NotificacionApp,
    | 'cantidad'
    | 'documentos'
    | 'actualizadaEn'
    | 'actorId'
    | 'actorNombre'
    | 'decision'
    | 'inactivoDesde'
    | 'claveDedup'
  >
>;

type AvisoLeido = {
  _id: Types.ObjectId;
  tipo: TipoNotificacionApp;
  candidatoId: Types.ObjectId;
  nombreCandidato: string;
  creadaEn: Date;
  leidaPor?: Types.ObjectId[];
  cantidad?: number;
  documentos?: string[];
  actualizadaEn?: Date;
  actorNombre?: string;
  decision?: DecisionExpediente;
  inactivoDesde?: Date;
};

const CAMPOS_AVISO =
  'tipo candidatoId nombreCandidato creadaEn leidaPor cantidad documentos actualizadaEn actorNombre decision inactivoDesde';

/** Forma pública de un aviso. Nunca expone `leidaPor` ni `destinatarios`. */
function aItem(d: AvisoLeido, leida: boolean): NotificacionAppItemDto {
  const item: NotificacionAppItemDto = {
    _id: String(d._id),
    tipo: d.tipo,
    candidatoId: String(d.candidatoId),
    nombreCandidato: d.nombreCandidato,
    mensaje: mensajeNotificacionApp(d),
    enlace: `/candidato/${String(d.candidatoId)}`,
    fecha: d.actualizadaEn ?? d.creadaEn,
    leida,
    cantidad: Math.max(1, d.cantidad ?? 1),
  };
  if (d.documentos?.length) item.documentos = [...new Set(d.documentos)];
  if (d.decision) item.decision = d.decision;
  if (d.actorNombre) item.actorNombre = d.actorNombre;
  const dias = diasInactivo(d.inactivoDesde, d.creadaEn);
  if (d.tipo === 'candidato_inactivo' && dias !== undefined) {
    item.diasInactivo = dias;
  }
  return item;
}

/**
 * Notificaciones dentro de la app (campanita) para evaluadores y
 * administradores. Los correos siguen en NotificacionesService; aquí no se
 * envía ninguno.
 */
@Injectable()
export class NotificacionesAppService {
  private readonly logger = new Logger(NotificacionesAppService.name);

  constructor(
    @InjectModel(NotificacionApp.name)
    private readonly notificacionModel: Model<NotificacionAppDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
  ) {}

  // ── Generación ────────────────────────────────────────────────────────────

  /** Crea el aviso "nuevo candidato" para todos los evaluadores y admins. */
  async notificarNuevoCandidato(
    candidatoId: IdLike,
    nombreCandidato: string,
  ): Promise<boolean> {
    const r = await this.crear(
      'nuevo_candidato',
      aObjectId(candidatoId),
      nombreCandidato,
    );
    return r === 'creada';
  }

  /**
   * Crea el aviso "expediente completo" UNA sola vez por candidato. La marca
   * atómica en Postulante evita duplicados si lo reenvía (o hay dos envíos a
   * la vez), y no se borra con el TTL de la notificación.
   */
  async notificarExpedienteCompleto(
    candidatoId: IdLike,
    nombreCandidato: string,
  ): Promise<boolean> {
    const id = aObjectId(candidatoId);
    const marca = await this.postulanteModel.updateOne(
      { _id: id, expedienteCompletoNotificadoEn: null },
      { $set: { expedienteCompletoNotificadoEn: new Date() } },
    );
    if (marca.modifiedCount === 0) {
      this.logger.log(
        `[expediente_completo] candidato ${String(id)}: ya se había avisado (o no existe el perfil); no se crea otro aviso`,
      );
      return false;
    }
    try {
      const r = await this.crear('expediente_completo', id, nombreCandidato);
      return r === 'creada';
    } catch (err) {
      // Si no se pudo guardar, libera la marca para que un reintento avise.
      await this.postulanteModel.updateOne(
        { _id: id },
        { $unset: { expedienteCompletoNotificadoEn: '' } },
      );
      throw err;
    }
  }

  /**
   * Un postulante subió (o reemplazó) un documento. Las subidas del mismo
   * candidato a menos de 10 min de la anterior se juntan en un solo aviso
   * ("subió 3 documentos: ..."), que vuelve a quedar sin leer para todos.
   *
   * NUNCA lanza: la subida no debe fallar por la campanita. Cualquier error
   * queda en el log con su stack.
   */
  async avisarDocumentoSubido(
    usuarioId: IdLike,
    etiqueta: string,
    ahora: Date = new Date(),
  ): Promise<boolean> {
    const etiquetaLog = `[documento_subido] usuario ${String(usuarioId)}`;
    try {
      const uid = aObjectId(usuarioId);
      const [perfil, usuario] = await Promise.all([
        this.postulanteModel
          .findOne({ usuarioId: uid })
          .select('_id')
          .lean<{ _id: Types.ObjectId }>()
          .exec(),
        this.usuarioModel
          .findById(uid)
          .select('nombre apellidos')
          .lean<{ nombre?: string; apellidos?: string }>()
          .exec(),
      ]);
      if (!perfil) {
        this.logger.warn(
          `${etiquetaLog}: no tiene perfil de postulante; no se crea el aviso`,
        );
        return false;
      }
      const candidatoId = perfil._id;
      const doc = etiqueta.trim() || 'Documento';

      if (await this.agregarADocumentoSubido(candidatoId, doc, ahora)) {
        return true;
      }

      const r = await this.crear(
        'documento_subido',
        candidatoId,
        nombreCompleto(usuario),
        {
          cantidad: 1,
          documentos: [doc],
          actualizadaEn: ahora,
          // Respaldo: dos subidas simultáneas no crean dos avisos.
          claveDedup: `documento_subido:${String(candidatoId)}:${Math.floor(
            ahora.getTime() / VENTANA_DOCUMENTOS_MS,
          )}`,
        },
        { creadaEn: ahora },
      );
      if (r === 'duplicada') {
        // Otra subida simultánea creó el aviso: se suma a ese.
        const sumado = await this.agregarADocumentoSubido(
          candidatoId,
          doc,
          ahora,
        );
        if (!sumado) {
          this.logger.warn(
            `${etiquetaLog}: clave duplicada y no se encontró el aviso para sumarse; esta subida no quedó en la campanita`,
          );
        }
        return sumado;
      }
      return r === 'creada';
    } catch (err) {
      this.logger.error(
        `${etiquetaLog}: no se pudo registrar el aviso: ${describirError(err)}`,
        (err as Error)?.stack,
      );
      return false;
    }
  }

  /** Suma la subida al aviso abierto del candidato (si hay uno en la ventana). */
  private async agregarADocumentoSubido(
    candidatoId: Types.ObjectId,
    etiqueta: string,
    ahora: Date,
  ): Promise<boolean> {
    const abierto = await this.notificacionModel
      .findOneAndUpdate(
        {
          tipo: 'documento_subido',
          candidatoId,
          actualizadaEn: {
            $gte: new Date(ahora.getTime() - VENTANA_DOCUMENTOS_MS),
          },
        },
        {
          $inc: { cantidad: 1 },
          $push: {
            documentos: { $each: [etiqueta], $slice: -MAX_DOCUMENTOS_EN_AVISO },
          },
          // Hay algo nuevo: vuelve a quedar sin leer para todos.
          $set: { actualizadaEn: ahora, leidaPor: [] },
        },
        {
          sort: { actualizadaEn: -1 },
          returnDocument: 'after',
          projection: { _id: 1, cantidad: 1 },
        },
      )
      .lean<{ _id: Types.ObjectId; cantidad: number }>()
      .exec();
    if (!abierto) return false;
    this.logger.log(
      `[documento_subido] candidato ${String(candidatoId)}: se sumó al aviso ${String(abierto._id)} (${abierto.cantidad} subida(s) en la ventana)`,
    );
    return true;
  }

  /**
   * Un evaluador o admin registró una decisión sobre un expediente. Avisa a
   * los DEMÁS evaluadores y admins (quien decidió no recibe su propio aviso).
   *
   * NUNCA lanza: la decisión ya se guardó. El error queda en el log.
   */
  async avisarExpedienteEvaluado(datos: {
    candidatoId: IdLike;
    nombreCandidato: string;
    decision: DecisionExpediente;
    actorId: IdLike;
    actorNombre: string;
  }): Promise<boolean> {
    const etiquetaLog = `[expediente_evaluado] candidato ${String(datos.candidatoId)}`;
    try {
      const actorId = aObjectId(datos.actorId);
      const r = await this.crear(
        'expediente_evaluado',
        aObjectId(datos.candidatoId),
        datos.nombreCandidato,
        {
          actorId,
          actorNombre: datos.actorNombre.trim() || undefined,
          decision: datos.decision,
        },
        { excluir: actorId },
      );
      return r === 'creada';
    } catch (err) {
      this.logger.error(
        `${etiquetaLog}: no se pudo registrar el aviso: ${describirError(err)}`,
        (err as Error)?.stack,
      );
      return false;
    }
  }

  @Cron('0 8 * * *', {
    name: 'avisos-candidatos-inactivos',
    timeZone: ZONA_HORARIA_AVISOS,
  })
  async revisarCandidatosInactivosCron(): Promise<void> {
    try {
      await this.revisarCandidatosInactivos();
    } catch (err) {
      this.logger.error(
        `[candidato_inactivo] la revisión diaria falló: ${describirError(err)}`,
        (err as Error)?.stack,
      );
    }
  }

  /**
   * Avisa de los candidatos con expediente incompleto y sin actividad en
   * los últimos 7 días. Un solo aviso por candidato y periodo de
   * inactividad: la marca `inactividadNotificadaDesde` guarda la última
   * actividad por la que ya se avisó; solo hay aviso nuevo si el candidato
   * volvió a tener actividad y otra vez se quedó 7 días quieto.
   *
   * Actividad = última de: alta de la cuenta o del perfil, último acceso,
   * subida de CV, de documento personal o registro de curso. Solo lee esas
   * colecciones; lo único que escribe es la marca (sin tocar `actualizadoEn`)
   * y el aviso. Se excluyen expedientes enviados y candidatos ya decididos.
   */
  async revisarCandidatosInactivos(ahora: Date = new Date()): Promise<{
    incompletos: number;
    inactivos: number;
    avisados: number;
    errores: number;
  }> {
    const limite = new Date(ahora.getTime() - DIAS_INACTIVIDAD * MS_DIA);

    const usuarios = await this.usuarioModel
      .find({ rol: 'postulante', isDeleted: { $ne: true } })
      .select('_id nombre apellidos ultimoAcceso creadoEn')
      .lean<
        {
          _id: Types.ObjectId;
          nombre?: string;
          apellidos?: string;
          ultimoAcceso?: Date;
          creadoEn?: Date;
        }[]
      >()
      .exec();
    const porUsuario = new Map(usuarios.map((u) => [String(u._id), u]));

    const perfiles = await this.postulanteModel
      .find({
        usuarioId: { $in: usuarios.map((u) => u._id) },
        estadoExpediente: { $ne: 'enviado' },
        estadoPostulacion: { $nin: ['completado', 'rechazado'] },
      })
      .select('_id usuarioId vacante creadoEn inactividadNotificadaDesde')
      .lean<
        {
          _id: Types.ObjectId;
          usuarioId: Types.ObjectId;
          vacante?: string;
          creadoEn?: Date;
          inactividadNotificadaDesde?: Date;
        }[]
      >()
      .exec();

    const ids = perfiles.map((p) => p._id);
    const db = this.postulanteModel.db;
    const agrupar = <T>(coleccion: string, grupo: Record<string, unknown>) =>
      db
        .collection(coleccion)
        .aggregate<T & { _id: Types.ObjectId }>([
          { $match: { postulanteId: { $in: ids } } },
          { $group: { _id: '$postulanteId', ...grupo } },
        ])
        .toArray();

    const [cvs, docs, cursos] = await Promise.all([
      agrupar<{ ultima?: Date; actual: number }>(
        String(DocumentoSchema.get('collection')),
        {
          ultima: { $max: '$subidasEn' },
          actual: { $max: { $cond: ['$esActual', 1, 0] } },
        },
      ),
      agrupar<{ ultima?: Date; tipos: string[] }>(
        String(DocPersonalSchema.get('collection')),
        { ultima: { $max: '$subidasEn' }, tipos: { $addToSet: '$tipo' } },
      ),
      agrupar<{ ultima?: Date }>(String(CursoSchema.get('collection')), {
        ultima: { $max: '$creadoEn' },
      }),
    ]);
    const mapa = <T extends { _id: Types.ObjectId }>(filas: T[]) =>
      new Map(filas.map((f) => [String(f._id), f]));
    const cvPor = mapa(cvs);
    const docsPor = mapa(docs);
    const cursosPor = mapa(cursos);

    let incompletos = 0;
    let inactivos = 0;
    let avisados = 0;
    let errores = 0;

    for (const p of perfiles) {
      const clave = String(p._id);
      const usuario = porUsuario.get(String(p.usuarioId));
      const cv = cvPor.get(clave);
      const dp = docsPor.get(clave);
      const incompleto = expedienteIncompleto({
        tieneCV: (cv?.actual ?? 0) === 1,
        tiposDocs: dp?.tipos ?? [],
        vacante: p.vacante,
      });
      if (!incompleto) continue;
      incompletos += 1;

      const ultima = ultimaFecha(
        usuario?.creadoEn,
        usuario?.ultimoAcceso,
        p.creadoEn,
        cv?.ultima,
        dp?.ultima,
        cursosPor.get(clave)?.ultima,
      );
      if (!ultima || ultima > limite) continue;
      inactivos += 1;

      const marcaPrevia = p.inactividadNotificadaDesde;
      if (marcaPrevia && new Date(marcaPrevia) >= ultima) continue;

      try {
        const ok = await this.avisarCandidatoInactivo(
          p._id,
          nombreCompleto(usuario),
          ultima,
          marcaPrevia,
          ahora,
        );
        if (ok) avisados += 1;
      } catch (err) {
        errores += 1;
        this.logger.error(
          `[candidato_inactivo] candidato ${clave}: falló el aviso: ${describirError(err)}`,
          (err as Error)?.stack,
        );
      }
    }

    this.logger.log(
      `[candidato_inactivo] revisión: ${perfiles.length} perfil(es) sin enviar, ${incompletos} incompleto(s), ${inactivos} sin actividad en ${DIAS_INACTIVIDAD}+ días, ${avisados} aviso(s) nuevo(s), ${errores} error(es)`,
    );
    return { incompletos, inactivos, avisados, errores };
  }

  /** Marca el periodo (atómico) y crea el aviso; si no se pudo, libera la marca. */
  private async avisarCandidatoInactivo(
    candidatoId: Types.ObjectId,
    nombreCandidato: string,
    ultimaActividad: Date,
    marcaPrevia: Date | undefined,
    ahora: Date,
  ): Promise<boolean> {
    const marca = await this.postulanteModel.updateOne(
      {
        _id: candidatoId,
        $or: [
          { inactividadNotificadaDesde: null },
          { inactividadNotificadaDesde: { $lt: ultimaActividad } },
        ],
      },
      { $set: { inactividadNotificadaDesde: ultimaActividad } },
      // La marca no es actividad del candidato: no toca actualizadoEn.
      { timestamps: false },
    );
    if (marca.modifiedCount === 0) {
      this.logger.log(
        `[candidato_inactivo] candidato ${String(candidatoId)}: ya se avisó por este periodo; no se crea otro aviso`,
      );
      return false;
    }

    const liberar = () =>
      this.postulanteModel.updateOne(
        { _id: candidatoId, inactividadNotificadaDesde: ultimaActividad },
        marcaPrevia
          ? { $set: { inactividadNotificadaDesde: marcaPrevia } }
          : { $unset: { inactividadNotificadaDesde: '' } },
        { timestamps: false },
      );

    let r: ResultadoCrear;
    try {
      r = await this.crear(
        'candidato_inactivo',
        candidatoId,
        nombreCandidato,
        {
          inactivoDesde: ultimaActividad,
          claveDedup: `candidato_inactivo:${String(candidatoId)}:${ultimaActividad.getTime()}`,
        },
        { creadaEn: ahora },
      );
    } catch (err) {
      await liberar();
      throw err;
    }
    // Sin evaluadores todavía: se reintenta mañana.
    if (r === 'sin_destinatarios') await liberar();
    return r === 'creada';
  }

  /** Evaluadores y admins que recibirían un aviso creado ahora. */
  private buscarDestinatarios(): Promise<Destinatario[]> {
    return this.usuarioModel
      .find(filtroDestinatariosApp())
      .select('_id rol')
      .lean<Destinatario[]>()
      .exec();
  }

  /**
   * Inserta el aviso. Registra siempre el resultado (cuántos destinatarios y
   * el _id creado) y cualquier error; los errores se relanzan para que el
   * llamador también los vea. Nunca registra nombres ni correos.
   */
  private async crear(
    tipo: TipoNotificacionApp,
    candidatoId: Types.ObjectId,
    nombreCandidato: string,
    extra: CamposExtra = {},
    opciones: { excluir?: Types.ObjectId; creadaEn?: Date } = {},
  ): Promise<ResultadoCrear> {
    const etiqueta = `[${tipo}] candidato ${String(candidatoId)}`;

    let usuarios: Destinatario[];
    try {
      usuarios = await this.buscarDestinatarios();
    } catch (err) {
      this.logger.error(
        `${etiqueta}: falló la búsqueda de destinatarios: ${describirError(err)}`,
        (err as Error)?.stack,
      );
      throw err;
    }
    const excluir = opciones.excluir;
    const excluidos = excluir
      ? usuarios.filter((u) => excluir.equals(u._id)).length
      : 0;
    if (excluir) usuarios = usuarios.filter((u) => !excluir.equals(u._id));
    const notaExcluidos = excluidos ? `; se excluye a quien lo originó` : '';

    if (usuarios.length === 0) {
      this.logger.warn(
        `${etiqueta}: 0 destinatarios (ningún otro usuario sin eliminar con rol evaluador/administrador${notaExcluidos}); no se crea el aviso`,
      );
      return 'sin_destinatarios';
    }
    this.logger.log(
      `${etiqueta}: ${usuarios.length} destinatario(s) (${formatearConteo(contarPorRol(usuarios))})${notaExcluidos}`,
    );

    try {
      const creada = await this.notificacionModel.create({
        tipo,
        candidatoId,
        nombreCandidato: nombreCandidato.trim() || 'Un postulante',
        destinatarios: usuarios.map((u) => u._id),
        leidaPor: [],
        creadaEn: opciones.creadaEn ?? new Date(),
        ...extra,
      });
      this.logger.log(
        `${etiqueta}: aviso guardado en notificaciones_app (_id ${String(creada._id)})`,
      );
      return 'creada';
    } catch (err) {
      if (esClaveDuplicada(err)) {
        // Índices únicos de respaldo (expediente_completo, claveDedup): ya
        // hay un aviso igual (otra petición ganó). No es una falla, pero se
        // registra para que nunca desaparezca en silencio.
        this.logger.warn(
          `${etiqueta}: no se insertó porque ya existe uno igual (clave duplicada): ${describirError(err)}`,
        );
        return 'duplicada';
      }
      this.logger.error(
        `${etiqueta}: falló el insert en notificaciones_app: ${describirError(err)}`,
        (err as Error)?.stack,
      );
      throw err;
    }
  }

  // ── Diagnóstico (solo lectura) ────────────────────────────────────────────

  /**
   * Qué pasaría si se creara un aviso ahora, SIN escribir nada: cuántos
   * destinatarios hay (por valor real de `rol`), si un correo concreto está
   * incluido y el estado de la colección. Solo lecturas.
   */
  async diagnosticar(email?: string): Promise<DiagnosticoNotificacionesAppDto> {
    const destinatarios = await this.buscarDestinatarios();
    const incluidos = new Set(destinatarios.map((u) => String(u._id)));

    let consulta: DiagnosticoNotificacionesAppDto['consulta'];
    if (email) {
      const correo = email.trim().toLowerCase();
      const cuentas = await this.usuarioModel
        .find({ email: correo })
        .select('_id rol isDeleted')
        .lean<(Destinatario & { isDeleted?: boolean })[]>()
        .exec();
      const filas = cuentas.map((c) => ({
        usuarioId: String(c._id),
        rol: String(c.rol ?? ''),
        eliminada: c.isDeleted === true,
        incluida: incluidos.has(String(c._id)),
      }));
      consulta = {
        email: correo,
        incluida: filas.some((f) => f.incluida),
        cuentas: filas,
      };
    }

    const nombre = this.notificacionModel.collection.collectionName;
    const db = this.notificacionModel.db.db;
    const existe = db
      ? (
          await db
            .listCollections({ name: nombre }, { nameOnly: true })
            .toArray()
        ).length > 0
      : false;

    let indices: string[] = [];
    let avisosPorTipo: Record<string, number> = {};
    let ultimaCreadaEn: Date | null = null;
    if (existe) {
      const [idx, grupos, ultima] = await Promise.all([
        this.notificacionModel.collection.indexes(),
        this.notificacionModel
          .aggregate<{
            _id: string;
            n: number;
          }>([{ $group: { _id: '$tipo', n: { $sum: 1 } } }])
          .exec(),
        this.notificacionModel
          .findOne()
          .sort({ creadaEn: -1 })
          .select('creadaEn')
          .lean<{ creadaEn?: Date }>()
          .exec(),
      ]);
      indices = idx.map((i) => String(i.name));
      avisosPorTipo = Object.fromEntries(
        grupos.map((g) => [String(g._id), g.n]),
      );
      ultimaCreadaEn = ultima?.creadaEn ?? null;
    }

    // Postulantes vivos sin perfil en `postulantes`: a ellos no se les pudo
    // crear el aviso "nuevo candidato" al registrarse (necesita el perfil).
    const sinPerfil = await this.usuarioModel
      .aggregate<{ n: number }>([
        { $match: { rol: 'postulante', isDeleted: { $ne: true } } },
        {
          $lookup: {
            from: this.postulanteModel.collection.collectionName,
            localField: '_id',
            foreignField: 'usuarioId',
            as: 'perfil',
          },
        },
        { $match: { perfil: { $size: 0 } } },
        { $count: 'n' },
      ])
      .exec();

    return {
      soloLectura: true,
      filtroRol: PATRON_ROL_DESTINATARIO.source,
      destinatarios: {
        total: destinatarios.length,
        porRol: contarPorRol(destinatarios),
      },
      consulta,
      coleccion: { nombre, existe, indices, avisosPorTipo, ultimaCreadaEn },
      postulantesSinPerfil: sinPerfil[0]?.n ?? 0,
    };
  }

  // ── Lectura por usuario ───────────────────────────────────────────────────

  /**
   * "Mis avisos" con filtros. El usuario siempre es el del JWT: el filtro
   * parte de `destinatarios: yo`, así que nunca se ven avisos ajenos.
   */
  private filtroMias(
    uid: Types.ObjectId,
    f: FiltroNotificacionesApp & { soloNoLeidas?: boolean },
  ): Record<string, unknown> {
    const filtro: Record<string, unknown> = { destinatarios: uid };
    if (f.soloNoLeidas) filtro.leidaPor = { $ne: uid };
    if (f.tipo) filtro.tipo = f.tipo;
    if (f.dia) {
      filtro.$expr = {
        $eq: [
          {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$creadaEn',
              timezone: ZONA_HORARIA_AVISOS,
            },
          },
          f.dia,
        ],
      };
    }
    return filtro;
  }

  /**
   * Notificaciones del usuario, más recientes primero, con su contador.
   * Con `agrupar: 'dia'` junta las del mismo tipo y día en una línea
   * ("5 postulantes nuevos hoy") con sus avisos dentro; la paginación es
   * entonces por grupo. `noLeidas` es siempre el total sin filtro (insignia).
   */
  async listarMias(
    userId: string,
    opciones: OpcionesListarNotificacionesApp = {},
    ahora: Date = new Date(),
  ): Promise<ListaNotificacionesAppDto> {
    const uid = aObjectId(userId);
    const p = Math.max(1, Math.floor(opciones.pagina ?? 1));
    const l = Math.min(
      LIMITE_NOTIFICACIONES_MAX,
      Math.max(1, Math.floor(opciones.limite ?? LIMITE_NOTIFICACIONES_DEFAULT)),
    );
    const filtro = this.filtroMias(uid, opciones);

    const [total, noLeidas] = await Promise.all([
      this.notificacionModel.countDocuments(filtro),
      this.notificacionModel.countDocuments({
        destinatarios: uid,
        leidaPor: { $ne: uid },
      }),
    ]);

    if (opciones.agrupar === 'dia') {
      const { grupos, totalGrupos } = await this.listarGrupos(
        uid,
        filtro,
        p,
        l,
        ahora,
      );
      return {
        items: [],
        total,
        noLeidas,
        pagina: p,
        limite: l,
        grupos,
        totalGrupos,
      };
    }

    const docs = await this.notificacionModel
      .find(filtro)
      .sort({ creadaEn: -1, _id: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .select(CAMPOS_AVISO)
      .lean<AvisoLeido[]>()
      .exec();

    const items = docs.map((d) =>
      aItem(
        d,
        (d.leidaPor ?? []).some((x) => uid.equals(x)),
      ),
    );
    return { items, total, noLeidas, pagina: p, limite: l };
  }

  private async listarGrupos(
    uid: Types.ObjectId,
    filtro: Record<string, unknown>,
    pagina: number,
    limite: number,
    ahora: Date,
  ): Promise<{ grupos: GrupoNotificacionesAppDto[]; totalGrupos: number }> {
    type Fila = AvisoLeido & { dia: string; leida: boolean };
    type Grupo = {
      _id: { dia: string; tipo: TipoNotificacionApp };
      cantidad: number;
      noLeidas: number;
      fecha: Date;
      items: Fila[];
    };

    const proyeccion: Record<string, unknown> = Object.fromEntries(
      CAMPOS_AVISO.split(' ')
        .filter((c) => c !== 'leidaPor')
        .map((c) => [c, 1]),
    );
    const [res] = await this.notificacionModel
      .aggregate<{ total: { n: number }[]; grupos: Grupo[] }>([
        { $match: filtro },
        { $sort: { creadaEn: -1, _id: -1 } },
        {
          $project: {
            ...proyeccion,
            dia: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$creadaEn',
                timezone: ZONA_HORARIA_AVISOS,
              },
            },
            leida: { $in: [uid, { $ifNull: ['$leidaPor', []] }] },
          },
        },
        {
          $group: {
            _id: { dia: '$dia', tipo: '$tipo' },
            cantidad: { $sum: 1 },
            noLeidas: { $sum: { $cond: ['$leida', 0, 1] } },
            fecha: { $max: { $ifNull: ['$actualizadaEn', '$creadaEn'] } },
            items: { $push: '$$ROOT' },
          },
        },
        { $sort: { '_id.dia': -1, fecha: -1, '_id.tipo': 1 } },
        {
          $facet: {
            total: [{ $count: 'n' }],
            grupos: [
              { $skip: (pagina - 1) * limite },
              { $limit: limite },
              {
                $project: {
                  cantidad: 1,
                  noLeidas: 1,
                  fecha: 1,
                  items: { $slice: ['$items', MAX_AVISOS_POR_GRUPO] },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const grupos = (res?.grupos ?? []).map((g) => ({
      clave: `${g._id.dia}|${g._id.tipo}`,
      tipo: g._id.tipo,
      dia: g._id.dia,
      cantidad: g.cantidad,
      noLeidas: g.noLeidas,
      resumen: resumenGrupo(g._id.tipo, g.cantidad, g._id.dia, ahora),
      fecha: g.fecha,
      items: g.items.map((d) => aItem(d, d.leida)),
      hayMas: g.cantidad > g.items.length,
    }));
    return { grupos, totalGrupos: res?.total[0]?.n ?? 0 };
  }

  /**
   * Marca una notificación como leída SOLO para este usuario. Si no es
   * destinatario responde 404 (igual que si no existe), así no se filtra
   * la existencia de avisos ajenos.
   */
  async marcarLeida(
    userId: string,
    notificacionId: string,
  ): Promise<{ message: string }> {
    const uid = aObjectId(userId);
    const res = await this.notificacionModel.updateOne(
      { _id: aObjectId(notificacionId), destinatarios: uid },
      { $addToSet: { leidaPor: uid } },
    );
    if (res.matchedCount === 0) {
      throw new NotFoundException('Notificación no encontrada');
    }
    return { message: 'Notificación marcada como leída' };
  }

  /** Marca todas las mías (o solo las de un tipo y/o día) como leídas. */
  async marcarTodasLeidas(
    userId: string,
    filtro: FiltroNotificacionesApp = {},
  ): Promise<MarcarTodasAppDto> {
    const uid = aObjectId(userId);
    const res = await this.notificacionModel.updateMany(
      this.filtroMias(uid, { ...filtro, soloNoLeidas: true }),
      { $addToSet: { leidaPor: uid } },
    );
    return {
      message: 'Notificaciones marcadas como leídas',
      actualizadas: res.modifiedCount,
    };
  }
}

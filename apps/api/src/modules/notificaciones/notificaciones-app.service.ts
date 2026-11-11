import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';

import {
  NotificacionApp,
  NotificacionAppDocument,
  TipoNotificacionApp,
} from './schemas/notificacion-app.schema';
import {
  ListaNotificacionesAppDto,
  LIMITE_NOTIFICACIONES_DEFAULT,
  LIMITE_NOTIFICACIONES_MAX,
  MarcarTodasAppDto,
  NotificacionAppItemDto,
} from './dto/notificacion-app.dto';
import { DiagnosticoNotificacionesAppDto } from './dto/diagnostico-notificaciones-app.dto';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';

/**
 * `rol` de los destinatarios. El esquema, los guards y el JWT usan
 * 'evaluador' y 'administrador' en minúsculas, pero una cuenta creada a mano
 * o por un script viejo puede traer otra capitalización, espacios o "admin".
 * Avisarle a esa cuenta no cuesta nada; dejarla fuera la deja sin campanita.
 */
export const PATRON_ROL_DESTINATARIO =
  /^\s*(evaluador|administrador|admin)\s*$/i;

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

export function mensajeNotificacionApp(
  tipo: TipoNotificacionApp,
  nombreCandidato: string,
): string {
  return tipo === 'nuevo_candidato'
    ? `${nombreCandidato} se registró como postulante.`
    : `${nombreCandidato} completó su expediente (100 %).`;
}

/**
 * Notificaciones dentro de la app (campanita) para evaluadores y
 * administradores. Los correos siguen en NotificacionesService.
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
    return this.crear(
      'nuevo_candidato',
      aObjectId(candidatoId),
      nombreCandidato,
    );
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
      return await this.crear('expediente_completo', id, nombreCandidato);
    } catch (err) {
      // Si no se pudo guardar, libera la marca para que un reintento avise.
      await this.postulanteModel.updateOne(
        { _id: id },
        { $unset: { expedienteCompletoNotificadoEn: '' } },
      );
      throw err;
    }
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
  ): Promise<boolean> {
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

    if (usuarios.length === 0) {
      this.logger.warn(
        `${etiqueta}: 0 destinatarios (ningún usuario sin eliminar con rol evaluador/administrador); no se crea el aviso`,
      );
      return false;
    }
    this.logger.log(
      `${etiqueta}: ${usuarios.length} destinatario(s) (${formatearConteo(contarPorRol(usuarios))})`,
    );

    try {
      const creada = await this.notificacionModel.create({
        tipo,
        candidatoId,
        nombreCandidato: nombreCandidato.trim() || 'Un postulante',
        destinatarios: usuarios.map((u) => u._id),
        leidaPor: [],
        creadaEn: new Date(),
      });
      this.logger.log(
        `${etiqueta}: aviso guardado en notificaciones_app (_id ${String(creada._id)})`,
      );
      return true;
    } catch (err) {
      if (esClaveDuplicada(err)) {
        // Índice único parcial de expediente_completo: ya hay un aviso vivo
        // de este candidato (otra petición ganó). No es una falla, pero se
        // registra para que nunca desaparezca en silencio.
        this.logger.warn(
          `${etiqueta}: no se insertó porque ya existe uno igual (clave duplicada): ${describirError(err)}`,
        );
        return false;
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

  /** Notificaciones del usuario, más recientes primero, con su contador. */
  async listarMias(
    userId: string,
    pagina = 1,
    limite = LIMITE_NOTIFICACIONES_DEFAULT,
  ): Promise<ListaNotificacionesAppDto> {
    const uid = aObjectId(userId);
    const p = Math.max(1, Math.floor(pagina));
    const l = Math.min(
      LIMITE_NOTIFICACIONES_MAX,
      Math.max(1, Math.floor(limite)),
    );
    const filtro = { destinatarios: uid };

    const [docs, total, noLeidas] = await Promise.all([
      this.notificacionModel
        .find(filtro)
        .sort({ creadaEn: -1, _id: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .select('tipo candidatoId nombreCandidato creadaEn leidaPor')
        .lean(),
      this.notificacionModel.countDocuments(filtro),
      this.notificacionModel.countDocuments({
        destinatarios: uid,
        leidaPor: { $ne: uid },
      }),
    ]);

    // No se expone `leidaPor` ni `destinatarios`: solo "¿la leí yo?".
    const items: NotificacionAppItemDto[] = docs.map((d) => ({
      _id: String(d._id),
      tipo: d.tipo,
      candidatoId: String(d.candidatoId),
      nombreCandidato: d.nombreCandidato,
      mensaje: mensajeNotificacionApp(d.tipo, d.nombreCandidato),
      enlace: `/candidato/${String(d.candidatoId)}`,
      fecha: d.creadaEn,
      leida: (d.leidaPor ?? []).some((x) => uid.equals(x)),
    }));

    return { items, total, noLeidas, pagina: p, limite: l };
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

  async marcarTodasLeidas(userId: string): Promise<MarcarTodasAppDto> {
    const uid = aObjectId(userId);
    const res = await this.notificacionModel.updateMany(
      { destinatarios: uid, leidaPor: { $ne: uid } },
      { $addToSet: { leidaPor: uid } },
    );
    return {
      message: 'Notificaciones marcadas como leídas',
      actualizadas: res.modifiedCount,
    };
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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
import {
  Usuario,
  UsuarioDocument,
  UserRole,
} from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';

/** Quiénes reciben los avisos de la campanita. */
export const ROLES_DESTINATARIOS_APP: UserRole[] = [
  'evaluador',
  'administrador',
];

type IdLike = Types.ObjectId | string;

function aObjectId(id: IdLike): Types.ObjectId {
  return id instanceof Types.ObjectId ? id : new Types.ObjectId(id);
}

function esClaveDuplicada(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
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
    if (marca.modifiedCount === 0) return false;
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

  private async crear(
    tipo: TipoNotificacionApp,
    candidatoId: Types.ObjectId,
    nombreCandidato: string,
  ): Promise<boolean> {
    const usuarios = await this.usuarioModel
      .find({
        rol: { $in: ROLES_DESTINATARIOS_APP },
        isDeleted: { $ne: true },
      })
      .select('_id')
      .lean();
    if (usuarios.length === 0) {
      this.logger.warn(`[${tipo}] sin evaluadores ni admins a quién avisar`);
      return false;
    }

    try {
      await this.notificacionModel.create({
        tipo,
        candidatoId,
        nombreCandidato: nombreCandidato.trim() || 'Un postulante',
        destinatarios: usuarios.map((u) => u._id),
        leidaPor: [],
        creadaEn: new Date(),
      });
    } catch (err) {
      // Índice único parcial de expediente_completo: otra petición ganó.
      if (esClaveDuplicada(err)) return false;
      throw err;
    }
    this.logger.log(
      `[${tipo}] candidato ${String(candidatoId)} → ${usuarios.length} destinatario(s)`,
    );
    return true;
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

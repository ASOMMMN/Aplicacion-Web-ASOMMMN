import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const TIPOS_NOTIFICACION_APP = [
  'nuevo_candidato',
  'expediente_completo',
  'documento_subido',
  'expediente_evaluado',
  'candidato_inactivo',
] as const;
export type TipoNotificacionApp = (typeof TIPOS_NOTIFICACION_APP)[number];

export const DECISIONES_EXPEDIENTE = [
  'en_proceso',
  'completado',
  'rechazado',
] as const;
export type DecisionExpediente = (typeof DECISIONES_EXPEDIENTE)[number];

/** Las notificaciones de la campanita se borran solas a los ~60 días. */
export const TTL_NOTIFICACION_APP_SEGUNDOS = 60 * 24 * 60 * 60;

/**
 * Aviso dentro de la app (campanita) para evaluadores y administradores.
 *
 * Un documento por evento. `destinatarios` es la foto de los evaluadores y
 * admins que había al crearlo. `leidaPor` guarda quién ya lo leyó, así que
 * cada usuario marca las suyas sin afectar a los demás.
 *
 * Es otra colección que la de vencimientos de cursos (`notificaciones`, ver
 * alertas-vencimiento): esa tiene un `leida` global y un índice único por curso.
 */
@Schema({ collection: 'notificaciones_app', timestamps: false })
export class NotificacionApp {
  @Prop({ type: String, enum: TIPOS_NOTIFICACION_APP, required: true })
  tipo: TipoNotificacionApp;

  /** _id del Postulante: el enlace es /candidato/<candidatoId>. */
  @Prop({ type: Types.ObjectId, ref: 'Postulante', required: true })
  candidatoId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombreCandidato: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Usuario' }], default: [] })
  destinatarios: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Usuario' }], default: [] })
  leidaPor: Types.ObjectId[];

  @Prop({ type: Date, required: true, default: () => new Date() })
  creadaEn: Date;

  // ── Campos según el tipo (opcionales; los avisos viejos no los tienen) ──

  /**
   * documento_subido: cuántas subidas junta este aviso (se agrupan por
   * candidato en una ventana corta). En los demás tipos vale 1.
   */
  @Prop({ type: Number, min: 1, default: 1 })
  cantidad: number;

  /** documento_subido: etiquetas de lo subido ("CURP", "Currículum Vitae"…). */
  @Prop({ type: [String], default: undefined })
  documentos?: string[];

  /** documento_subido: última subida que se agregó a este aviso. */
  @Prop({ type: Date })
  actualizadaEn?: Date;

  /** expediente_evaluado: quién decidió (no recibe su propio aviso). */
  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  actorId?: Types.ObjectId;

  @Prop({ type: String, trim: true })
  actorNombre?: string;

  /** expediente_evaluado: decisión registrada. */
  @Prop({ type: String, enum: DECISIONES_EXPEDIENTE })
  decision?: DecisionExpediente;

  /** candidato_inactivo: última actividad del candidato antes del aviso. */
  @Prop({ type: Date })
  inactivoDesde?: Date;

  /**
   * Clave de deduplicación (respaldo contra carreras), p. ej. el candidato y
   * la ventana de 10 min de documento_subido o el periodo de inactividad.
   */
  @Prop({ type: String })
  claveDedup?: string;
}

export const NotificacionAppSchema =
  SchemaFactory.createForClass(NotificacionApp);
export type NotificacionAppDocument = NotificacionApp & Document;

// "Mis notificaciones, más recientes primero" (multikey sobre destinatarios).
NotificacionAppSchema.index({ destinatarios: 1, creadaEn: -1 });
// Borrado automático a los 60 días.
NotificacionAppSchema.index(
  { creadaEn: 1 },
  { expireAfterSeconds: TTL_NOTIFICACION_APP_SEGUNDOS },
);
// Respaldo contra carreras: un solo "expediente_completo" vivo por candidato.
// La deduplicación permanente es la marca en Postulante
// (expedienteCompletoNotificadoEn), que no se borra con el TTL.
NotificacionAppSchema.index(
  { tipo: 1, candidatoId: 1 },
  {
    unique: true,
    partialFilterExpression: { tipo: 'expediente_completo' },
  },
);
// Respaldo contra carreras de los tipos con clave (documento_subido,
// candidato_inactivo). Los avisos sin clave no entran al índice.
NotificacionAppSchema.index(
  { claveDedup: 1 },
  {
    unique: true,
    partialFilterExpression: { claveDedup: { $type: 'string' } },
  },
);
// Ventana de agrupación de documento_subido.
NotificacionAppSchema.index(
  { candidatoId: 1, tipo: 1, actualizadaEn: -1 },
  { partialFilterExpression: { tipo: 'documento_subido' } },
);

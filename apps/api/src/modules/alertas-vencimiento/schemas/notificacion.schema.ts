import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TipoNotificacion = 'curso_por_vencer';

@Schema({
  collection: 'notificaciones',
  timestamps: false,
})
export class Notificacion {
  @Prop({ type: String, enum: ['curso_por_vencer'], required: true, index: true })
  tipo: TipoNotificacion;

  @Prop({ type: Types.ObjectId, ref: 'Postulante', required: true, index: true })
  candidatoId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Curso', required: true, index: true })
  cursoId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombreCandidato: string;

  @Prop({ required: true, trim: true })
  nombreCurso: string;

  @Prop({ required: true })
  fechaVencimiento: Date;

  @Prop({ type: Number, enum: [90, 30, 7], required: true })
  diasAnticipacion: number;

  @Prop({ type: Boolean, default: false, index: true })
  leida: boolean;

  @Prop({ required: true, default: () => new Date() })
  fechaCreacion: Date;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', default: null })
  evaluadorId: Types.ObjectId | null;
}

export const NotificacionSchema = SchemaFactory.createForClass(Notificacion);
export type NotificacionDocument = Notificacion & Document;

// Un candidato solo recibe UNA notificación por curso y por umbral de aviso.
NotificacionSchema.index({ cursoId: 1, diasAnticipacion: 1 }, { unique: true });
NotificacionSchema.index({ leida: 1, fechaCreacion: -1 });

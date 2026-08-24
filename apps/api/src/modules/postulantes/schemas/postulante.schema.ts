import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EstadoPostulacion = 'en_proceso' | 'completado' | 'rechazado';

@Schema({
  collection: 'postulantes',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Postulante {
  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
    unique: true,
  })
  usuarioId: Types.ObjectId;

  // Datos personales extendidos
  @Prop({ trim: true })
  telefono?: string;

  @Prop()
  fechaNacimiento?: Date;

  @Prop({ trim: true })
  ciudad?: string;

  @Prop({ trim: true })
  pais?: string;

  @Prop()
  linkedinUrl?: string;

  // Vacante a la que aspira
  @Prop({ trim: true })
  vacante?: string;

  // Estado en el proceso
  @Prop({
    type: String,
    enum: ['en_proceso', 'completado', 'rechazado'],
    default: 'en_proceso',
  })
  estadoPostulacion: EstadoPostulacion;

  // Estado del expediente (independiente del estado de postulación)
  @Prop({
    type: String,
    enum: ['en_proceso', 'enviado'],
    default: 'en_proceso',
  })
  estadoExpediente: 'en_proceso' | 'enviado';

  @Prop()
  enviadoEn?: Date;

  // Auditoría
  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const PostulanteSchema = SchemaFactory.createForClass(Postulante);
export type PostulanteDocument = Postulante & Document;

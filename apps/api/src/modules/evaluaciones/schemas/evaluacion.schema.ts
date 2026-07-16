import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'evaluaciones',
  timestamps: { createdAt: 'creadoEn', updatedAt: false },
})
export class Evaluacion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  evaluadorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  comentario: string;

  @Prop({ min: 1, max: 10 })
  calificacion?: number;

  @Prop({
    type: String,
    enum: ['en_proceso', 'completado', 'rechazado'],
    default: 'en_proceso',
  })
  estadoSugerido: 'en_proceso' | 'completado' | 'rechazado';

  @Prop()
  creadoEn: Date;
}

export const EvaluacionSchema = SchemaFactory.createForClass(Evaluacion);
export type EvaluacionDocument = Evaluacion & Document;

EvaluacionSchema.index({ postulanteId: 1, creadoEn: -1 });

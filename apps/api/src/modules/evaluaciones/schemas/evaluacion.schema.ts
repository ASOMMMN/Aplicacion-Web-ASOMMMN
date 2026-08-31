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

  @Prop({ trim: true })
  nombreEvaluador?: string;

  @Prop()
  fechaEvaluacion?: Date;

  @Prop({
    type: String,
    enum: ['APROBADO', 'RECHAZADO', 'EN_REVISION'],
  })
  resultadoEvaluacion?: 'APROBADO' | 'RECHAZADO' | 'EN_REVISION';

  @Prop()
  creadoEn: Date;
}

export const EvaluacionSchema = SchemaFactory.createForClass(Evaluacion);
export type EvaluacionDocument = Evaluacion & Document;

EvaluacionSchema.index({ postulanteId: 1, creadoEn: -1 });

// Candado real a nivel BD: un candidato no puede tener más de una evaluación
// CON resultado final (resultadoEvaluacion seteado). Es parcial (no un índice
// único plano) porque hay historial legado de múltiples comentarios por
// candidato de antes de esta funcionalidad, ninguno con resultadoEvaluacion.
EvaluacionSchema.index(
  { postulanteId: 1 },
  {
    unique: true,
    partialFilterExpression: { resultadoEvaluacion: { $exists: true } },
    // Nombre explícito: el índice no-único autogenerado por `index: true` en
    // postulanteId ya ocupa el nombre por defecto "postulanteId_1".
    name: 'postulanteId_1_evaluacion_unica',
  },
);

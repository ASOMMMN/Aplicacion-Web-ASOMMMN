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

  // Clave del documento evaluado (una de CLAVES_REQUISITO en
  // expediente.constants.ts), o 'general' para registros legados de cuando
  // la evaluación era del expediente completo, no de un documento puntual.
  @Prop({ type: String, required: true, trim: true, index: true })
  documentoClave: string;

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

// Historial por documento: última evaluación primero. Sin unique — un mismo
// documento puede re-evaluarse cualquier cantidad de veces, por cualquier
// evaluador; no hay candado a nivel BD (ver migrar-evaluaciones-documento.ts,
// que dropea el índice único que existía antes de este cambio).
EvaluacionSchema.index({ postulanteId: 1, documentoClave: 1, creadoEn: -1 });

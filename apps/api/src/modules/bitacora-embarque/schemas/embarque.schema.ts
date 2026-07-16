import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'embarques',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Embarque {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({ required: true })
  fechaEmbarco: Date;

  @Prop({ required: true })
  fechaDesembarco: Date;

  @Prop({ required: true, trim: true })
  naviera: string;

  @Prop({ required: true, trim: true })
  nombreNave: string;

  @Prop({ required: true, trim: true })
  tipoMaquina: string;

  @Prop({ required: true })
  potenciaKW: number;

  @Prop({ required: true, trim: true })
  tipoNave: string;

  @Prop({ required: true, trim: true })
  rango: string;

  @Prop({ required: true, trim: true })
  bandera: string;

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const EmbarqueSchema = SchemaFactory.createForClass(Embarque);
export type EmbarqueDocument = Embarque & Document;

EmbarqueSchema.index({ postulanteId: 1, fechaEmbarco: -1 });

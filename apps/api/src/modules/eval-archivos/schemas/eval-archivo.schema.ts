import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'eval_archivos',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class EvalArchivo {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId!: Types.ObjectId;

  /** Carpeta padre; null = raíz */
  @Prop({
    type: Types.ObjectId,
    ref: 'EvalArchivo',
    default: null,
    index: true,
  })
  parentId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  nombre!: string;

  @Prop({ required: true, enum: ['archivo', 'carpeta'], default: 'archivo' })
  tipo!: 'archivo' | 'carpeta';

  @Prop({ default: '' })
  storagePath!: string;

  @Prop({ default: '' })
  tipoMime!: string;

  @Prop({ default: 0 })
  tamanio!: number;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  creadoPor!: Types.ObjectId;

  @Prop()
  creadoEn!: Date;

  @Prop()
  actualizadoEn!: Date;
}

export const EvalArchivoSchema = SchemaFactory.createForClass(EvalArchivo);
export type EvalArchivoDocument = EvalArchivo & Document;

EvalArchivoSchema.index(
  { postulanteId: 1, parentId: 1, nombre: 1 },
  { unique: true },
);
EvalArchivoSchema.index({ postulanteId: 1, tipo: 1 });

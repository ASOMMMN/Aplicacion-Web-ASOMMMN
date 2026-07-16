import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'cursos',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Curso {
  @Prop({ type: Types.ObjectId, ref: 'Postulante', required: true, index: true })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombreCurso: string;

  @Prop({ trim: true })
  institucion?: string;

  @Prop({ required: true })
  fechaCurso: Date;

  @Prop({ required: true, default: false })
  apareceEnCV: boolean;

  @Prop({
    type: {
      storagePath: { type: String },
      nombreOriginal: { type: String },
      tipoMime: { type: String },
      tamanio: { type: Number },
      subidoEn: { type: Date },
    },
    required: false,
  })
  documentoExtra?: {
    storagePath: string;
    nombreOriginal: string;
    tipoMime: string;
    tamanio: number;
    subidoEn: Date;
  };

  @Prop()
  fechaInicio?: Date;

  @Prop()
  fechaVencimiento?: Date;

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const CursoSchema = SchemaFactory.createForClass(Curso);
export type CursoDocument = Curso & Document;

CursoSchema.index({ postulanteId: 1, fechaCurso: -1 });
CursoSchema.index({ usuarioId: 1, creadoEn: -1 });

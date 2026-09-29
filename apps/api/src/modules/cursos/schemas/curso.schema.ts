import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'cursos',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Curso {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
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
      cloudinaryUrl: { type: String },
      cloudinaryPublicId: { type: String },
      storageType: { type: String, enum: ['local', 'cloudinary'] },
      nombreOriginal: { type: String },
      tipoMime: { type: String },
      tamanio: { type: Number },
      subidoEn: { type: Date },
    },
    required: false,
  })
  documentoExtra?: {
    storagePath: string;
    cloudinaryUrl?: string;
    cloudinaryPublicId?: string;
    storageType?: 'local' | 'cloudinary';
    nombreOriginal: string;
    tipoMime: string;
    tamanio: number;
    subidoEn: Date;
  };

  @Prop()
  fechaInicio?: Date;

  @Prop()
  fechaVencimiento?: Date;

  /**
   * true = fechaVencimiento no la dio el postulante: la calculaba el sistema
   * (fechaInicio + 5 años) antes de quitar esa regla. La marca el script
   * scripts/marcar-vencimientos-estimados.ts; no se borra la fecha.
   */
  @Prop({ default: false })
  fechaVencimientoEstimada?: boolean;

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const CursoSchema = SchemaFactory.createForClass(Curso);
export type CursoDocument = Curso & Document;

CursoSchema.index({ postulanteId: 1, fechaCurso: -1 });
CursoSchema.index({ usuarioId: 1, creadoEn: -1 });

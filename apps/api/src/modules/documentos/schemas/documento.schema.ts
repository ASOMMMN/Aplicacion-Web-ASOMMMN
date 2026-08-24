import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'documentos',
  timestamps: { createdAt: 'subidasEn', updatedAt: false },
})
export class Documento {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  usuarioId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombreOriginal!: string;

  @Prop({ default: 'application/pdf' })
  tipoMime!: string;

  @Prop({ required: true })
  tamanio!: number;

  @Prop({ required: true, index: true })
  hash!: string;

  /** Ruta relativa legacy del disco local: category/key (solo informativa) */
  @Prop({ required: true, trim: true })
  storagePath!: string;

  @Prop()
  cloudinaryUrl?: string;

  @Prop()
  cloudinaryPublicId?: string;

  /** Ausente o 'local' = archivo legacy en disco (ya no existe en Render); 'cloudinary' = disponible */
  @Prop({ enum: ['local', 'cloudinary'] })
  storageType?: 'local' | 'cloudinary';

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ required: true, default: true, index: true })
  esActual!: boolean;

  @Prop({ required: true })
  subidasPor!: Types.ObjectId;

  @Prop({ required: true })
  subidasEn!: Date;

  @Prop()
  verificadoEn?: Date;
}

export const DocumentoSchema = SchemaFactory.createForClass(Documento);
export type DocumentoDocument = Documento & Document;

DocumentoSchema.index({ postulanteId: 1, esActual: 1 });
DocumentoSchema.index({ usuarioId: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentoNubeTipo = 'folder' | 'file';

@Schema({
  collection: 'documentos_nube',
  timestamps: true,
})
export class DocumentoNube {
  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, enum: ['folder', 'file'], required: true, index: true })
  tipo!: DocumentoNubeTipo;

  @Prop({
    type: Types.ObjectId,
    ref: 'DocumentoNube',
    default: null,
    index: true,
  })
  parentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  storageKey!: string | null;

  @Prop({ type: String, default: null })
  mimeType!: string | null;

  @Prop({ type: Number, default: 0 })
  size!: number;

  @Prop({ type: String, default: null })
  extension!: string | null;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', default: null })
  updatedBy!: Types.ObjectId | null;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export const DocumentoNubeSchema = SchemaFactory.createForClass(DocumentoNube);
export type DocumentoNubeDocument = DocumentoNube & Document;

DocumentoNubeSchema.index(
  { ownerId: 1, parentId: 1, nombre: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);
DocumentoNubeSchema.index({ ownerId: 1, isDeleted: 1, tipo: 1 });
DocumentoNubeSchema.index({ ownerId: 1, isDeleted: 1, nombre: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NubeItemTipo = 'archivo' | 'carpeta';
export type NubeItemCategoria = 'cv' | 'curso' | 'certificacion' | 'otro';

@Schema({
  collection: 'postulante_nube_items',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class NubeItem {
  @Prop({ type: Types.ObjectId, ref: 'Postulante', required: true, index: true })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'NubeItem', default: null, index: true })
  parentId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ type: String, enum: ['archivo', 'carpeta'], required: true })
  tipo: NubeItemTipo;

  @Prop({
    type: String,
    enum: ['cv', 'curso', 'certificacion', 'otro'],
    default: 'otro',
  })
  categoria: NubeItemCategoria;

  @Prop({ trim: true })
  mimeType?: string;

  @Prop()
  tamanio?: number;

  @Prop({ trim: true })
  storagePath?: string;

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export type NubeItemDocument = NubeItem & Document;
export const NubeItemSchema = SchemaFactory.createForClass(NubeItem);

NubeItemSchema.index({ postulanteId: 1, parentId: 1, nombre: 1 });
NubeItemSchema.index({ usuarioId: 1, creadoEn: -1 });

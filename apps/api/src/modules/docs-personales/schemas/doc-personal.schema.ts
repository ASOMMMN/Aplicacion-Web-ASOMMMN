import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';

export type DocPersonalDocument = HydratedDocument<DocPersonal>;

@Schema({ collection: 'docs_personales', timestamps: false })
export class DocPersonal {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  usuarioId: Types.ObjectId;

  @Prop({ type: String, enum: TIPOS_DOC_PERSONAL, required: true, index: true })
  tipo: TipoDocPersonal;

  @Prop({ required: true })
  nombreOriginal: string;

  @Prop({ required: true })
  tipoMime: string;

  @Prop({ required: true })
  tamanio: number;

  @Prop({ required: true })
  storagePath: string;

  @Prop()
  cloudinaryUrl?: string;

  @Prop()
  cloudinaryPublicId?: string;

  @Prop({ enum: ['local', 'cloudinary'] })
  storageType?: 'local' | 'cloudinary';

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  subidasPor: Types.ObjectId;

  @Prop({ default: () => new Date() })
  subidasEn: Date;
}

export const DocPersonalSchema = SchemaFactory.createForClass(DocPersonal);

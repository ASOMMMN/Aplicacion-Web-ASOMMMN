import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class MFA extends Document {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Usuario', unique: true })
  usuarioId: Types.ObjectId;

  @Prop({ required: true })
  secret: string;

  @Prop({ default: false })
  activo: boolean;

  @Prop({ type: Date, default: null })
  activadoEn: Date | null;

  @Prop({ type: [String], default: [] })
  codigosRecuperacion: string[];

  @Prop({ type: Date, default: null })
  generadosCodigosEn: Date | null;

  @Prop({ type: Date, required: true })
  creadoEn: Date;

  @Prop({ type: Date, required: true })
  actualizadoEn: Date;
}

export const MFASchema = SchemaFactory.createForClass(MFA);
MFASchema.index({ activo: 1 });

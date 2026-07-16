import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'auditoria',
  timestamps: { createdAt: 'creadoEn', updatedAt: false },
})
export class Auditoria {
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  actorId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  actorEmail!: string;

  @Prop({ required: true, trim: true, index: true })
  accion!: string;

  @Prop({ required: true, trim: true, index: true })
  recurso!: string;

  @Prop({ trim: true, index: true })
  recursoId?: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true })
  creadoEn!: Date;
}

export const AuditoriaSchema = SchemaFactory.createForClass(Auditoria);
export type AuditoriaDocument = Auditoria & Document;

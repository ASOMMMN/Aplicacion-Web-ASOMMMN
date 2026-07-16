import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OneTimeTokenType = 'email_verification';

@Schema({
  collection: 'one_time_tokens',
  timestamps: { createdAt: 'creadoEn', updatedAt: false },
})
export class OneTimeToken {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Usuario', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true, enum: ['email_verification'] })
  tipo: OneTimeTokenType;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  usado: boolean;
}

export const OneTimeTokenSchema = SchemaFactory.createForClass(OneTimeToken);
OneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OneTimeTokenDocument = OneTimeToken & Document;

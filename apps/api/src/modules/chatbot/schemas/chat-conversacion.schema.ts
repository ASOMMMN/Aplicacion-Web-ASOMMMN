import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RolMensaje = 'usuario' | 'asistente';

export class Mensaje {
  @Prop({ type: String, enum: ['usuario', 'asistente'], required: true })
  rol: RolMensaje;

  @Prop({ required: true })
  contenido: string;

  /** Solo aplica a mensajes del asistente: si la IA consideró la duda resuelta. */
  @Prop({ type: Boolean })
  resuelto?: boolean;

  @Prop({ required: true })
  creadoEn: Date;
}

@Schema({
  collection: 'chat_conversaciones',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class ChatConversacion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  mensajes: Mensaje[];

  /** Contador de respuestas consecutivas donde resuelto=false. Se reinicia a 0 cuando resuelto=true. */
  @Prop({ type: Number, default: 0 })
  intentosSinResolver: number;

  /** Se marca true cuando intentosSinResolver alcanza MAX_INTENTOS_SIN_RESOLVER. */
  @Prop({ type: Boolean, default: false })
  whatsappOfrecido: boolean;

  /** false cuando el postulante inicia un nuevo chat; solo la activa se usa en el bot. */
  @Prop({ type: Boolean, default: true, index: true })
  activa: boolean;

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const ChatConversacionSchema =
  SchemaFactory.createForClass(ChatConversacion);

export type ChatConversacionDocument = ChatConversacion & Document;

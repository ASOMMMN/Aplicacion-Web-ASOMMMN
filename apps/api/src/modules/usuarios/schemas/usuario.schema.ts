import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'postulante' | 'evaluador' | 'administrador';
export type AccountStatus = 'pendiente_verificacion' | 'activa' | 'bloqueada';

@Schema({
  collection: 'usuarios',
  timestamps: { createdAt: 'creadoEn', updatedAt: false },
})
export class Usuario {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: false, index: true })
  debeCambiarContrasena: boolean;

  @Prop({
    required: true,
    enum: ['postulante', 'evaluador', 'administrador'],
    index: true,
  })
  rol: UserRole;

  @Prop({
    required: true,
    enum: ['pendiente_verificacion', 'activa', 'bloqueada'],
    default: 'pendiente_verificacion',
  })
  estadoCuenta: AccountStatus;

  @Prop({ default: false })
  emailVerificado: boolean;

  @Prop()
  emailVerificadoEn?: Date;

  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ required: true, trim: true })
  apellidos: string;

  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  creadoPor?: Types.ObjectId;

  @Prop()
  ultimoAcceso?: Date;
}

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
export type UsuarioDocument = Usuario & Document;

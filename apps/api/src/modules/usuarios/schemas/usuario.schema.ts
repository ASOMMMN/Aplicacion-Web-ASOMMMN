import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'postulante' | 'evaluador' | 'administrador';
export type AccountStatus = 'pendiente_verificacion' | 'activa' | 'bloqueada';
export type DeletedByRole = 'ADMIN' | 'EVALUADOR' | 'SELF' | 'SYSTEM';

export interface DeletedSnapshot {
  nombre: string;
  apellidos: string;
  email: string;
}

@Schema({
  collection: 'usuarios',
  timestamps: { createdAt: 'creadoEn', updatedAt: false },
})
export class Usuario {
  // Único solo entre cuentas activas: el índice parcial de abajo permite
  // reusar el correo de una cuenta eliminada (soft-delete) para un registro
  // nuevo.
  @Prop({
    required: true,
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

  @Prop()
  creadoEn: Date;

  // ─── Soft delete ────────────────────────────────────────────────────────────

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  /** Quién ejecutó la baja: el propio usuario (SELF) o el admin/evaluador actor. */
  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  deletedBy?: Types.ObjectId;

  @Prop({ enum: ['ADMIN', 'EVALUADOR', 'SELF', 'SYSTEM'] })
  deletedByRole?: DeletedByRole;

  @Prop({ trim: true })
  deletionReason?: string;

  /** Copia de nombre/apellidos/email al momento de la baja, para no mostrar solo un ID. */
  @Prop({ type: Object })
  deletedSnapshot?: DeletedSnapshot;
}

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
UsuarioSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
export type UsuarioDocument = Usuario & Document;

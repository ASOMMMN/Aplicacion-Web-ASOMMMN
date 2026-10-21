import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EstadoPostulacion = 'en_proceso' | 'completado' | 'rechazado';

/**
 * Reconstrucción, a partir de Auditoría, de la eliminación de un usuario que
 * ya era HARD DELETE antes de que existiera soft-delete en `Usuario` — ese
 * documento ya no existe y no se puede recuperar. Se guarda aquí (en el
 * Postulante, que sí sobrevive) porque es el único lugar donde aún queda
 * rastro. Ver script reconstruir-eliminaciones-legacy.ts.
 */
export interface LegacyEliminacionUsuario {
  detectado: true;
  origen: 'admin' | 'desconocido';
  email?: string;
  nombre?: string;
  apellidos?: string;
  deletedAt?: Date;
  deletedByEmail?: string;
  deletedByNombre?: string;
  motivo?: string;
  reconstruidoEn: Date;
}

@Schema({
  collection: 'postulantes',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Postulante {
  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
    unique: true,
  })
  usuarioId: Types.ObjectId;

  // Datos personales extendidos
  @Prop({ trim: true })
  telefono?: string;

  @Prop()
  fechaNacimiento?: Date;

  @Prop({ trim: true })
  ciudad?: string;

  @Prop({ trim: true })
  pais?: string;

  @Prop()
  linkedinUrl?: string;

  // Vacante a la que aspira
  @Prop({ trim: true })
  vacante?: string;

  // Estado en el proceso
  @Prop({
    type: String,
    enum: ['en_proceso', 'completado', 'rechazado'],
    default: 'en_proceso',
  })
  estadoPostulacion: EstadoPostulacion;

  // Estado del expediente (independiente del estado de postulación)
  @Prop({
    type: String,
    enum: ['en_proceso', 'enviado'],
    default: 'en_proceso',
  })
  estadoExpediente: 'en_proceso' | 'enviado';

  @Prop()
  enviadoEn?: Date;

  // Auditoría
  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;

  @Prop({ type: Object })
  legacyEliminacion?: LegacyEliminacionUsuario;
}

export const PostulanteSchema = SchemaFactory.createForClass(Postulante);

// Soportan los filtros/orden de GET /evaluaciones/candidatos (ver
// evaluaciones.service.ts#construirCandidatos + filtrar-ordenar-candidatos.util.ts).
PostulanteSchema.index({ vacante: 1 });
PostulanteSchema.index({ creadoEn: -1 });
PostulanteSchema.index({ actualizadoEn: -1 });
PostulanteSchema.index({ estadoPostulacion: 1 });

export type PostulanteDocument = Postulante & Document;

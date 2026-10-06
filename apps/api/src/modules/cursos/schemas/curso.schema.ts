import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ORIGENES_VENCIMIENTO,
  OrigenVencimiento,
} from '../regla-vencimiento-curso';
import {
  ESTADOS_EXTRACCION,
  EstadoExtraccion,
} from '../../docs-personales/ia/estado-extraccion';

@Schema({
  collection: 'cursos',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Curso {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true, index: true })
  usuarioId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombreCurso: string;

  @Prop({ trim: true })
  institucion?: string;

  @Prop({ required: true })
  fechaCurso: Date;

  @Prop({ required: true, default: false })
  apareceEnCV: boolean;

  @Prop({
    type: {
      storagePath: { type: String },
      cloudinaryUrl: { type: String },
      cloudinaryPublicId: { type: String },
      storageType: { type: String, enum: ['local', 'cloudinary'] },
      nombreOriginal: { type: String },
      tipoMime: { type: String },
      tamanio: { type: Number },
      subidoEn: { type: Date },
    },
    required: false,
  })
  documentoExtra?: {
    storagePath: string;
    cloudinaryUrl?: string;
    cloudinaryPublicId?: string;
    storageType?: 'local' | 'cloudinary';
    nombreOriginal: string;
    tipoMime: string;
    tamanio: number;
    subidoEn: Date;
  };

  @Prop()
  fechaInicio?: Date;

  /** Fecha de expedición/emisión del certificado (antes se copiaba en fechaInicio). */
  @Prop()
  fechaEmision?: Date;

  @Prop()
  fechaVencimiento?: Date;

  /**
   * true = fechaVencimiento no viene del documento: la calculó el sistema
   * (inicio o emisión + 5 años). Siempre se muestra como "estimado (5 años)".
   * Va junto con origenVencimiento = CALCULADO_5_ANOS.
   */
  @Prop({ default: false })
  fechaVencimientoEstimada?: boolean;

  /**
   * De dónde salió el vencimiento (regla-vencimiento-curso.ts). Ausente en
   * cursos anteriores a 2026-10-05: se deduce al leer
   * (origenVencimientoDeCurso) hasta correr la migración.
   */
  @Prop({ type: String, enum: ORIGENES_VENCIMIENTO })
  origenVencimiento?: OrigenVencimiento;

  /** Evidencia de la lectura con IA del documento (mismo formato que en DocPersonal). */
  @Prop({ type: Object })
  detalleFechasIa?: Record<string, unknown>;

  /** Confianza de la IA por campo leído del documento. */
  @Prop({ type: Object })
  confianza?: Partial<
    Record<
      'nombreCurso' | 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      'alta' | 'media' | 'baja'
    >
  >;

  /** Resultado de la lectura del documento con IA (ausente = sin documento o sin analizar). */
  @Prop({ type: String, enum: ESTADOS_EXTRACCION })
  extraccionEstado?: EstadoExtraccion;

  /** Las fechas registradas no coinciden con el documento o falta la base del vencimiento. */
  @Prop({ default: false })
  revisarFechas?: boolean;

  @Prop({ type: [String], default: undefined })
  motivosRevision?: string[];

  @Prop()
  creadoEn: Date;

  @Prop()
  actualizadoEn: Date;
}

export const CursoSchema = SchemaFactory.createForClass(Curso);
export type CursoDocument = Curso & Document;

CursoSchema.index({ postulanteId: 1, fechaCurso: -1 });
CursoSchema.index({ usuarioId: 1, creadoEn: -1 });

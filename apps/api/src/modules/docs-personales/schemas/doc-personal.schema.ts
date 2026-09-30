import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import { ESTADOS_EXTRACCION, EstadoExtraccion } from '../ia/estado-extraccion';

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

  @Prop()
  fechaInicio?: Date;

  @Prop()
  fechaVencimiento?: Date;

  @Prop()
  fechaEmision?: Date;

  // ── Resultado del análisis con IA ─────────────────────────────────────────

  /** Evidencia por fecha: texto literal, etiqueta, confianza y precisión. */
  @Prop({ type: Object })
  detalleFechasIa?: Record<string, unknown>;

  /** La validación en código marcó alguna fecha para que el evaluador la revise. */
  @Prop({ default: false })
  revisarFechas?: boolean;

  @Prop({ type: [String], default: undefined })
  motivosRevision?: string[];

  /** El contenido no corresponde al tipo elegido por el postulante. */
  @Prop({ type: Object, default: null })
  tipoSospechoso?: { tipoElegido: string; tipoDetectado: string } | null;

  /**
   * Resultado de la última extracción (ver ia/estado-extraccion.ts).
   * Ausente en documentos anteriores a este campo: se deduce al leer.
   */
  @Prop({ type: String, enum: ESTADOS_EXTRACCION, index: true })
  extraccionEstado?: EstadoExtraccion;

  /** Motivo cuando extraccionEstado = 'error'. */
  @Prop({ type: String, default: null })
  extraccionError?: string | null;

  /** Último análisis con IA. Ausente = el documento nunca se analizó. */
  @Prop({ type: Object })
  analisisIa?: {
    analizadoEn: Date;
    modelo: string;
    origen?: string;
    paginasLeidas?: number;
    paginasTotales?: number;
    /** Mensaje si la lectura o la IA fallaron (las fechas no se tocaron). */
    error?: string;
  };

  /**
   * Corrección manual del evaluador. Si existe, fechaEmision/fechaInicio/
   * fechaVencimiento tienen estos valores y un nuevo análisis con IA NO los
   * sobrescribe (solo actualiza detalleFechasIa y analisisIa).
   */
  @Prop({ type: Object })
  fechasVerificadas?: FechasVerificadas;
}

export interface FechasVerificadas {
  fechaEmision: Date | null;
  fechaInicio: Date | null;
  fechaVencimiento: Date | null;
  verificadoPor: Types.ObjectId;
  verificadoPorEmail: string;
  verificadoEn: Date;
}

export const DocPersonalSchema = SchemaFactory.createForClass(DocPersonal);

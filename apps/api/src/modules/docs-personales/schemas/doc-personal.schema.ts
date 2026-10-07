import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import { ESTADOS_EXTRACCION, EstadoExtraccion } from '../ia/estado-extraccion';
import type { PrecisionFecha } from '../ia/formatos-fecha';
import type { CambioFecha, MetaFechas } from '../ia/meta-fechas';
import type {
  CambiosAnalisis,
  PropuestaFechasIa,
} from '../ia/cambios-analisis';

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

  /**
   * Precisión de cada fecha según su texto: "dia", "mes" o "anio". Una fecha
   * parcial se guarda al inicio (emisión/inicio) o al final (vencimiento)
   * del periodo y se muestra como "04/2025" o "2016". Ausente = "dia".
   */
  @Prop({ type: Object })
  precisionFechas?: PrecisionFechas;

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
    /**
     * Versión de la canalización (VERSION_CANALIZACION). Ausente = análisis
     * anterior al 2026-10-05: un reanálisis lo puede reemplazar.
     */
    versionCanalizacion?: string;
    /** El reanálisis reemplazó fechas de una versión anterior. */
    reemplazo?: CambiosAnalisis['analisisIa']['reemplazo'];
    /** Fechas que el reanálisis no encontró y se conservaron. */
    conservadas?: CambiosAnalisis['analisisIa']['conservadas'];
  };

  /**
   * Fechas que un reanálisis leyó distintas a las guardadas. No se aplican
   * solas: el evaluador las acepta o las descarta. null = sin propuesta.
   */
  @Prop({ type: Object, default: null })
  propuestaFechasIa?: PropuestaFechasIa | null;

  /**
   * Por fecha: fuente (ia | manual | regla | cv), precisión, confianza
   * (0–1), evidencia y bloqueo manual. Ausente en registros anteriores al
   * 2026-10-06: se deduce al leer (meta-fechas-derivadas.ts) hasta migrar.
   */
  @Prop({ type: Object })
  metaFechas?: MetaFechas;

  /** Cambios de fechas: quién, cuándo, valor anterior → nuevo. */
  @Prop({ type: [Object], default: undefined })
  historialFechas?: CambioFecha[];

  /**
   * Corrección manual del evaluador. Si existe, fechaEmision/fechaInicio/
   * fechaVencimiento tienen estos valores y un nuevo análisis con IA NO los
   * sobrescribe (solo actualiza detalleFechasIa y analisisIa).
   */
  @Prop({ type: Object })
  fechasVerificadas?: FechasVerificadas;
}

export type PrecisionFechas = Partial<
  Record<'fechaEmision' | 'fechaInicio' | 'fechaVencimiento', PrecisionFecha>
>;

export interface FechasVerificadas {
  fechaEmision: Date | null;
  fechaInicio: Date | null;
  fechaVencimiento: Date | null;
  verificadoPor: Types.ObjectId;
  verificadoPorEmail: string;
  verificadoEn: Date;
}

export const DocPersonalSchema = SchemaFactory.createForClass(DocPersonal);

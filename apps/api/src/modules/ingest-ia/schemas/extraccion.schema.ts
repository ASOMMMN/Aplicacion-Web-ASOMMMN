import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EstadoExtraccion = 'propuesto' | 'confirmado' | 'rechazado';

export type ConfianzaIa = 'alta' | 'media' | 'baja';

/**
 * Curso detectado en el CV. Las fechas son null cuando el CV no las indica
 * (nunca se infieren). `confianza` solo existe en extracciones hechas después
 * de agregar el campo; las antiguas no lo traen.
 */
export interface CursoCV {
  nombre?: string;
  institucion?: string | null;
  fechaInicio?: string | null;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  /** true = la calculó el sistema (inicio + 5 años), no venía en el CV. */
  fechaVencimientoEstimada?: boolean;
  confianza?: {
    fechaInicio?: ConfianzaIa;
    fechaEmision?: ConfianzaIa;
    fechaVencimiento?: ConfianzaIa;
  };
}

export interface DatosCV {
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null;
  telefono?: string | null;
  resumen?: string | null;
  estudios?: Array<{
    institucion?: string;
    grado?: string;
    area?: string;
    inicio?: string;
    fin?: string;
  }>;
  experienciaLaboral?: Array<{
    empresa?: string;
    puesto?: string;
    inicio?: string;
    fin?: string;
    descripcion?: string;
  }>;
  cursos?: Array<CursoCV>;
  habilidades?: string[];
  idiomas?: Array<{ idioma?: string; nivel?: string }>;
}

@Schema({
  collection: 'extracciones_ia',
  timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' },
})
export class Extraccion {
  @Prop({
    type: Types.ObjectId,
    ref: 'Postulante',
    required: true,
    index: true,
  })
  postulanteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Documento', required: true })
  documentoId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['propuesto', 'confirmado', 'rechazado'],
    default: 'propuesto',
    index: true,
  })
  estado!: EstadoExtraccion;

  @Prop({ type: Object })
  datosExtraidos?: DatosCV;

  @Prop({ type: Object })
  datosConfirmados?: DatosCV;

  @Prop({ trim: true })
  modeloUsado?: string;

  @Prop({ trim: true })
  errorMensaje?: string;

  @Prop({ type: Types.ObjectId, ref: 'Usuario' })
  confirmadoPor?: Types.ObjectId;

  @Prop()
  confirmadoEn?: Date;

  creadoEn!: Date;
  actualizadoEn!: Date;
}

export const ExtraccionSchema = SchemaFactory.createForClass(Extraccion);
export type ExtraccionDocument = Extraccion & Document;

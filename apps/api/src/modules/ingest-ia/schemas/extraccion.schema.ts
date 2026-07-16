import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EstadoExtraccion = 'propuesto' | 'confirmado' | 'rechazado';

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
  cursos?: Array<{
    nombre?: string;
    institucion?: string;
    fechaInicio?: string | null;
    fechaVencimiento?: string | null;
  }>;
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

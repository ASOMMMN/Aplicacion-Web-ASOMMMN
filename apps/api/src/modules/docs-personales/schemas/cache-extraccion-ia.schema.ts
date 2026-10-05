import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CacheExtraccionIaDocument = HydratedDocument<CacheExtraccionIa>;

/** Días que se conserva un resultado en caché. */
export const DIAS_CACHE_EXTRACCION = 180;

/**
 * Resultado de una extracción por archivo: el mismo archivo (mismo sha256),
 * tipo, modelo, versión de la canalización y semilla devuelve SIEMPRE lo
 * mismo, sin volver a llamar a OpenAI. "Volver a analizar" la omite (y la
 * actualiza). Solo se guardan extracciones sin error.
 */
@Schema({ collection: 'cache_extraccion_ia', timestamps: false })
export class CacheExtraccionIa {
  /** sha256|tipo|modelo|versión|seed|config de lectura */
  @Prop({ required: true, unique: true })
  clave: string;

  @Prop({ required: true, index: true })
  sha256: string;

  @Prop({ required: true })
  tipo: string;

  @Prop({ required: true })
  modelo: string;

  @Prop({ required: true })
  versionCanalizacion: string;

  /** ResultadoExtraccionFechas completo. */
  @Prop({ type: Object, required: true })
  resultado: Record<string, unknown>;

  @Prop({
    default: () => new Date(),
    expires: DIAS_CACHE_EXTRACCION * 24 * 60 * 60,
  })
  creadoEn: Date;
}

export const CacheExtraccionIaSchema =
  SchemaFactory.createForClass(CacheExtraccionIa);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Contador de intentos de autenticación (login, cambio de contraseña
 * obligatorio, registro, recuperación) para el bloqueo temporal por fuerza
 * bruta. Ver ProteccionFuerzaBrutaService.
 *
 * `clave` es `<política>:<sha256(correo o IP)>`: no se guardan correos ni
 * IPs en claro. El documento se borra solo (TTL) al pasar `expiraEn`.
 */
@Schema({ collection: 'auth_intentos', versionKey: false })
export class IntentoAuth {
  @Prop({ required: true, unique: true })
  clave!: string;

  /** Intentos dentro de la ventana vigente. */
  @Prop({ default: 0 })
  intentos!: number;

  /** Fin de la ventana de conteo (desde el primer intento). */
  @Prop()
  ventanaHasta?: Date;

  /** Mientras sea futura, la clave está bloqueada. */
  @Prop()
  bloqueadoHasta?: Date;

  /** max(ventanaHasta, bloqueadoHasta): después, el TTL borra el documento. */
  @Prop()
  expiraEn?: Date;
}

export type IntentoAuthDocument = HydratedDocument<IntentoAuth>;
export const IntentoAuthSchema = SchemaFactory.createForClass(IntentoAuth);
IntentoAuthSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

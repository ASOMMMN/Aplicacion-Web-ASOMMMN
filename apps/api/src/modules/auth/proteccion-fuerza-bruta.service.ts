import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';

import {
  IntentoAuth,
  IntentoAuthDocument,
} from './schemas/intento-auth.schema';

export interface PoliticaIntentos {
  /** Prefijo de la clave en BD; separa los contadores de cada política. */
  prefijo: string;
  /** Al llegar a este número de intentos dentro de la ventana, se bloquea. */
  maxIntentos: number;
  /** La ventana se abre con el primer intento y no se extiende. */
  ventanaMs: number;
  /** Duración del bloqueo desde el intento que lo dispara. */
  bloqueoMs: number;
}

const MIN = 60_000;
const HORA = 60 * MIN;

/**
 * Políticas de bloqueo temporal (S-01 en AUDITORIA.md). Se combinan con el
 * límite por IP de @nestjs/throttler en cada endpoint.
 */
export const POLITICAS = {
  /** Contraseña errónea por cuenta (login y cambio obligatorio comparten). */
  cuenta: {
    prefijo: 'cuenta',
    maxIntentos: 5,
    ventanaMs: 15 * MIN,
    bloqueoMs: 15 * MIN,
  },
  /** Contraseña errónea por IP, a través de cuentas (credential stuffing). */
  loginIp: {
    prefijo: 'login-ip',
    maxIntentos: 20,
    ventanaMs: 15 * MIN,
    bloqueoMs: 15 * MIN,
  },
  /** Intentos de registro por correo: evita bombardear un buzón con avisos. */
  registroCorreo: {
    prefijo: 'registro-correo',
    maxIntentos: 3,
    ventanaMs: HORA,
    bloqueoMs: HORA,
  },
  /** Registros con correo ya registrado por IP: enumeración. */
  registroIp: {
    prefijo: 'registro-ip',
    maxIntentos: 5,
    ventanaMs: HORA,
    bloqueoMs: HORA,
  },
  /** Correos de recuperación por destinatario (evita bombardear un buzón). */
  recuperacionCorreo: {
    prefijo: 'recuperacion',
    maxIntentos: 3,
    ventanaMs: HORA,
    bloqueoMs: HORA,
  },
} as const satisfies Record<string, PoliticaIntentos>;

/**
 * Bloqueo temporal por intentos fallidos, guardado en MongoDB para que
 * sobreviva reinicios/despliegues y valga con varias instancias.
 *
 * El conteo es atómico (una sola actualización con pipeline), así que
 * peticiones en paralelo no se "comen" intentos.
 */
@Injectable()
export class ProteccionFuerzaBrutaService {
  private readonly logger = new Logger(ProteccionFuerzaBrutaService.name);

  /** Reloj inyectable para pruebas. */
  ahora: () => Date = () => new Date();

  constructor(
    @InjectModel(IntentoAuth.name)
    private readonly intentoModel: Model<IntentoAuthDocument>,
  ) {}

  /** Correo en minúsculas sin espacios; IP tal cual. Siempre hasheado. */
  clave(politica: PoliticaIntentos, valor: string): string {
    const normalizado = valor.trim().toLowerCase();
    const hash = createHash('sha256').update(normalizado).digest('hex');
    return `${politica.prefijo}:${hash}`;
  }

  /** Segundos que faltan de bloqueo (0 = libre) para el peor de los pares. */
  async segundosDeBloqueo(
    pares: ReadonlyArray<readonly [PoliticaIntentos, string]>,
  ): Promise<number> {
    const claves = pares
      .filter(([, valor]) => valor.trim().length > 0)
      .map(([p, valor]) => this.clave(p, valor));
    if (claves.length === 0) return 0;

    const ahora = this.ahora();
    const bloqueos = await this.intentoModel
      .find({ clave: { $in: claves }, bloqueadoHasta: { $gt: ahora } })
      .select('bloqueadoHasta')
      .lean<{ bloqueadoHasta: Date }[]>();
    const hasta = Math.max(
      0,
      ...bloqueos.map((b) => b.bloqueadoHasta.getTime()),
    );
    return hasta > ahora.getTime()
      ? Math.ceil((hasta - ahora.getTime()) / 1000)
      : 0;
  }

  /** Lanza 429 si alguno de los pares está bloqueado. */
  async exigirSinBloqueo(
    pares: ReadonlyArray<readonly [PoliticaIntentos, string]>,
    mensaje: (minutos: number) => string = mensajeBloqueo,
  ): Promise<void> {
    const segundos = await this.segundosDeBloqueo(pares);
    if (segundos > 0) {
      const minutos = Math.ceil(segundos / 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Bloqueo temporal',
          message: mensaje(minutos),
          reintentarEnSegundos: segundos,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Suma un intento. Al llegar a `maxIntentos` dentro de la ventana, la
   * clave queda bloqueada `bloqueoMs`. Nunca lanza: un fallo aquí no debe
   * tapar el error original (p. ej. el 401 del login); se registra.
   */
  async registrar(
    politica: PoliticaIntentos,
    valor: string,
  ): Promise<{ intentos: number; bloqueadoHasta: Date | null } | null> {
    if (!valor.trim()) return null;
    const ahora = this.ahora();
    const finVentana = new Date(ahora.getTime() + politica.ventanaMs);
    const finBloqueo = new Date(ahora.getTime() + politica.bloqueoMs);
    try {
      const doc = await this.intentoModel
        .findOneAndUpdate(
          { clave: this.clave(politica, valor) },
          [
            { $set: { _vigente: { $gt: ['$ventanaHasta', ahora] } } },
            {
              $set: {
                intentos: {
                  $cond: [
                    '$_vigente',
                    { $add: [{ $ifNull: ['$intentos', 0] }, 1] },
                    1,
                  ],
                },
                ventanaHasta: {
                  $cond: ['$_vigente', '$ventanaHasta', finVentana],
                },
              },
            },
            {
              $set: {
                bloqueadoHasta: {
                  $cond: [
                    { $gte: ['$intentos', politica.maxIntentos] },
                    finBloqueo,
                    { $ifNull: ['$bloqueadoHasta', null] },
                  ],
                },
              },
            },
            {
              $set: {
                expiraEn: { $max: ['$ventanaHasta', '$bloqueadoHasta'] },
              },
            },
            { $unset: '_vigente' },
          ],
          { upsert: true, returnDocument: 'after', updatePipeline: true },
        )
        .lean<{ intentos: number; bloqueadoHasta?: Date | null }>();

      const bloqueadoHasta =
        doc?.bloqueadoHasta && doc.bloqueadoHasta > ahora
          ? doc.bloqueadoHasta
          : null;
      if (bloqueadoHasta && doc?.intentos === politica.maxIntentos) {
        this.logger.warn(
          `[fuerza-bruta] bloqueo temporal "${politica.prefijo}" hasta ${bloqueadoHasta.toISOString()} tras ${doc.intentos} intentos`,
        );
      }
      return { intentos: doc?.intentos ?? 0, bloqueadoHasta };
    } catch (err) {
      this.logger.error(
        `[fuerza-bruta] no se pudo registrar el intento "${politica.prefijo}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Borra el contador (tras un login correcto). Nunca lanza. */
  async limpiar(politica: PoliticaIntentos, valor: string): Promise<void> {
    if (!valor.trim()) return;
    try {
      await this.intentoModel.deleteOne({ clave: this.clave(politica, valor) });
    } catch (err) {
      this.logger.error(
        `[fuerza-bruta] no se pudo limpiar "${politica.prefijo}": ${(err as Error).message}`,
      );
    }
  }
}

export function mensajeBloqueo(minutos: number): string {
  return `Demasiados intentos fallidos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e inténtalo de nuevo.`;
}

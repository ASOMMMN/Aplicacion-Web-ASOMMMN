import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai';

import { crearClienteOpenAI } from '../../common/utils/openai-client.util';
import { configReintentosDesdeEnv } from '../../common/utils/openai-errores.util';
import {
  esSnapshotFechado,
  extraerFechasDocPersonal,
  modeloDocsDesdeEnv,
  ResultadoExtraccionFechas,
  seedDesdeEnv,
  VERSION_CANALIZACION,
} from './ia/extraer-fechas-doc-personal';
import { configLecturaDesdeEnv } from './ia/lectura-documento';
import type { TipoDocPersonal } from './constants/tipos-doc-personal';
import {
  CacheExtraccionIa,
  CacheExtraccionIaDocument,
} from './schemas/cache-extraccion-ia.schema';

export interface PeticionExtraccion {
  buffer: Buffer;
  mimeType: string;
  tipo: TipoDocPersonal;
  /** false en "Volver a analizar" y en el análisis por lotes. */
  usarCache: boolean;
  /** Prefijo de los mensajes de error en el log (p. ej. "[doc 123]"). */
  contextoLog?: string;
}

export type ResultadoConCache = ResultadoExtraccionFechas & {
  /** El resultado salió de la caché (no se llamó a OpenAI). */
  desdeCache?: boolean;
};

/**
 * Punto único de extracción de fechas con IA: arma la configuración desde
 * el entorno (modelo fechado, semilla, lectura, reintentos) y aplica la
 * caché por hash del archivo.
 */
@Injectable()
export class ExtraccionIaService {
  private readonly logger = new Logger(ExtraccionIaService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(CacheExtraccionIa.name)
    private readonly cacheModel: Model<CacheExtraccionIaDocument>,
  ) {
    this.openai = crearClienteOpenAI(this.leer('OPENAI_API_KEY') ?? '');
    const modelo = this.modelo;
    if (!esSnapshotFechado(modelo)) {
      this.logger.warn(
        `OPENAI_MODEL_DOCS="${modelo}" no es un snapshot fechado: las fechas pueden cambiar cuando OpenAI actualice el alias. Usa p. ej. gpt-4o-2024-11-20.`,
      );
    }
  }

  private leer = (k: string) => this.config.get<string>(k);

  get modelo(): string {
    return modeloDocsDesdeEnv(this.leer);
  }

  /** Clave de caché: archivo + todo lo que puede cambiar el resultado. */
  claveCache(buffer: Buffer, tipo: string): { clave: string; sha256: string } {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const lectura = createHash('sha256')
      .update(JSON.stringify(configLecturaDesdeEnv(this.leer)))
      .digest('hex')
      .slice(0, 12);
    return {
      sha256,
      clave: [
        sha256,
        tipo,
        this.modelo,
        VERSION_CANALIZACION,
        seedDesdeEnv(this.leer),
        lectura,
      ].join('|'),
    };
  }

  async extraer(p: PeticionExtraccion): Promise<ResultadoConCache> {
    const { clave, sha256 } = this.claveCache(p.buffer, p.tipo);
    if (p.usarCache) {
      const previo = await this.cacheModel
        .findOne({ clave })
        .lean()
        .catch((err: Error) => {
          this.logger.warn(`No se pudo leer la caché de IA: ${err.message}`);
          return null;
        });
      if (previo) {
        return {
          ...(previo.resultado as unknown as ResultadoExtraccionFechas),
          desdeCache: true,
        };
      }
    }

    const r = await extraerFechasDocPersonal({
      buffer: p.buffer,
      mimeType: p.mimeType,
      tipo: p.tipo,
      apiKey: this.leer('OPENAI_API_KEY') ?? '',
      modelo: this.modelo,
      openai: this.openai,
      lectura: configLecturaDesdeEnv(this.leer),
      reintentos: configReintentosDesdeEnv(this.leer),
      seed: seedDesdeEnv(this.leer),
      onError: (m) =>
        this.logger.error(p.contextoLog ? `${p.contextoLog} ${m}` : m),
    });

    // Solo se guardan extracciones completas: un error se reintenta.
    if (r.resultado.iaDisponible && !r.resultado.errorMensaje) {
      await this.cacheModel
        .updateOne(
          { clave },
          {
            $set: {
              clave,
              sha256,
              tipo: p.tipo,
              modelo: this.modelo,
              versionCanalizacion: VERSION_CANALIZACION,
              resultado: JSON.parse(JSON.stringify(r)) as Record<
                string,
                unknown
              >,
              creadoEn: new Date(),
            },
          },
          { upsert: true },
        )
        .catch((err: Error) =>
          this.logger.warn(
            `No se pudo guardar en la caché de IA: ${err.message}`,
          ),
        );
    }
    return r;
  }
}

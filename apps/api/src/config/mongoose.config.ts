import type { ConfigService } from '@nestjs/config';
import type { MongooseModuleFactoryOptions } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import {
  fase,
  hostMongo,
  logArranque,
} from '../common/arranque/fases-arranque';

/**
 * Opciones de la conexión a MongoDB.
 *
 * En producción `autoIndex` y `autoCreate` van en false: Mongoose ya no
 * crea colecciones ni índices al compilar cada modelo mientras la app
 * arranca. Los índices se sincronizan en segundo plano DESPUÉS de abrir el
 * puerto (ver sincronizarIndicesEnSegundoPlano en main.ts), un modelo a la
 * vez y registrando los fallos. Dev y prod comparten la base de Atlas, así
 * que en desarrollo se mantiene el comportamiento de siempre.
 */
export function opcionesMongoose(
  config: ConfigService,
): MongooseModuleFactoryOptions {
  const uri = config.get<string>('MONGODB_URI');
  const enProduccion = config.get<string>('NODE_ENV') === 'production';
  return {
    uri,
    autoIndex: !enProduccion,
    autoCreate: !enProduccion,
    onConnectionCreate: (conexion: Connection) => {
      fase('mongo', `conectando a MongoDB (${hostMongo(uri)})`);
      escucharEventosMongo(conexion);
    },
  };
}

/** Eventos de la conexión directo a stdout (no esperan al logger de Nest). */
export function escucharEventosMongo(conexion: Connection): void {
  conexion.on('connected', () => logArranque('MongoDB conectado', 'mongo'));
  conexion.on('reconnected', () => logArranque('MongoDB reconectado', 'mongo'));
  conexion.on('disconnected', () =>
    logArranque('MongoDB desconectado', 'mongo'),
  );
  conexion.on('error', (err: Error) =>
    logArranque(
      `error de MongoDB: ${err?.name ?? ''} ${err?.message ?? err}`,
      'mongo',
    ),
  );
}

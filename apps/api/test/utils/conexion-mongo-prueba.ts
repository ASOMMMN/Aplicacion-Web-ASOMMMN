import * as os from 'node:os';
import { Connection, ConnectOptions, createConnection } from 'mongoose';

/**
 * Conexión de Mongoose para pruebas con mongodb-memory-server.
 *
 * El driver `mongodb` >= 7.6 (el que trae mongoose >= 9.10) carga su
 * adaptador de `os` con un `import('os')` dinámico. Dentro del sandbox de
 * Jest (CommonJS, sin --experimental-vm-modules) ese import falla en
 * silencio y el handshake sale sin `client.driver`: mongod responde
 * "Missing required sub-document 'driver' in the client metadata document"
 * y la conexión nunca se abre.
 *
 * Pasar `runtimeAdapters.os` evita el import dinámico. Solo afecta a las
 * pruebas: en Node normal (producción) el import funciona.
 */
export function conectarMongoPrueba(
  uri: string,
  opciones: ConnectOptions = {},
): Promise<Connection> {
  return createConnection(uri, {
    ...opciones,
    runtimeAdapters: { os },
  }).asPromise();
}

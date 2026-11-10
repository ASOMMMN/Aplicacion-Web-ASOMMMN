import { EventEmitter } from 'node:events';
import { _usarEscritor } from '../common/arranque/fases-arranque';
import { escucharEventosMongo, opcionesMongoose } from './mongoose.config';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as never;

describe('opcionesMongoose', () => {
  let lineas: string[];
  beforeEach(() => {
    lineas = [];
    _usarEscritor((l) => lineas.push(l));
  });

  it('producción: sin autoIndex ni autoCreate (no crea índices al arrancar)', () => {
    const op = opcionesMongoose(
      config({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://h/db' }),
    );
    expect(op).toMatchObject({
      uri: 'mongodb://h/db',
      autoIndex: false,
      autoCreate: false,
    });
  });

  it('desarrollo y pruebas: igual que antes (autoIndex y autoCreate)', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const op = opcionesMongoose(config({ NODE_ENV, MONGODB_URI: 'x' }));
      expect(op.autoIndex).toBe(true);
      expect(op.autoCreate).toBe(true);
    }
  });

  it('al crear la conexión registra la fase y el host sin contraseña', () => {
    const op = opcionesMongoose(
      config({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://admin:secreto@cluster0.ab.mongodb.net/db',
      }),
    );
    const conexion = new EventEmitter();
    op.onConnectionCreate?.(conexion as never);
    expect(lineas.join('\n')).toContain(
      'fase=mongo conectando a MongoDB (cluster0.ab.mongodb.net)',
    );
    expect(lineas.join('\n')).not.toContain('secreto');
    expect(conexion.listenerCount('error')).toBe(1);
  });

  it('los eventos de la conexión salen al momento en el log', () => {
    const conexion = new EventEmitter();
    escucharEventosMongo(conexion as never);
    conexion.emit('connected');
    conexion.emit('error', new Error('querySrv ETIMEOUT'));
    conexion.emit('disconnected');
    const log = lineas.join('\n');
    expect(log).toContain('MongoDB conectado');
    expect(log).toContain('error de MongoDB: Error querySrv ETIMEOUT');
    expect(log).toContain('MongoDB desconectado');
  });
});

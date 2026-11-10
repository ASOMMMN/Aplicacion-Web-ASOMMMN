import { Connection, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  mensajeFallo,
  sincronizarIndices,
  sincronizarIndicesEnSegundoPlano,
} from './indices-segundo-plano';
import {
  NotificacionApp,
  NotificacionAppSchema,
  TTL_NOTIFICACION_APP_SEGUNDOS,
} from '../../modules/notificaciones/schemas/notificacion-app.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../../modules/postulantes/schemas/postulante.schema';

/**
 * Como en producción: autoIndex/autoCreate apagados, datos que ya existen
 * (incluidos duplicados que chocan con el índice único parcial).
 */
jest.setTimeout(120_000);

describe('sincronizarIndices (MongoDB en memoria, autoIndex apagado)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let lineas: string[];
  const log = (l: string) => lineas.push(l);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      // Con varias suites levantando mongod en paralelo (Windows/CI), los
      // 10 s por defecto a veces no alcanzan y falla todo el beforeAll.
      instance: { launchTimeout: 60_000 },
    });
    conexion = await createConnection(mongod.getUri('indices'), {
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    conexion.model(NotificacionApp.name, NotificacionAppSchema);
    conexion.model(Postulante.name, PostulanteSchema);

    // Datos "de producción" previos: dos expediente_completo del mismo candidato.
    const candidato = new Types.ObjectId();
    const dup = () => ({
      tipo: 'expediente_completo',
      candidatoId: candidato,
      nombreCandidato: 'Dup',
      destinatarios: [],
      leidaPor: [],
      creadaEn: new Date(),
    });
    await conexion.collection('notificaciones_app').insertMany([dup(), dup()]);
    await conexion.collection('postulantes').insertMany(
      Array.from({ length: 200 }, () => ({
        usuarioId: new Types.ObjectId(),
      })),
    );
  });

  afterAll(async () => {
    await conexion?.close();
    await mongod?.stop();
  });

  beforeEach(() => {
    lineas = [];
  });

  it('con autoIndex apagado, compilar los modelos no crea índices', async () => {
    const antes = await conexion.collection('notificaciones_app').indexes();
    expect(antes.map((i) => i.name)).toEqual(['_id_']);
  });

  it('crea los índices que faltan, avisa del duplicado y no lanza', async () => {
    const r = await sincronizarIndices(conexion, log);

    expect(r.modelos).toBe(2);
    expect(r.fallidos).toHaveLength(1);
    expect(r.fallidos[0]).toMatchObject({ modelo: 'NotificacionApp' });

    const indices = await conexion.collection('notificaciones_app').indexes();
    const ttl = indices.find((i) => JSON.stringify(i.key) === '{"creadaEn":1}');
    expect(ttl?.expireAfterSeconds).toBe(TTL_NOTIFICACION_APP_SEGUNDOS);
    expect(
      indices.find(
        (i) => JSON.stringify(i.key) === '{"destinatarios":1,"creadaEn":-1}',
      ),
    ).toBeDefined();
    // El único parcial no pudo crearse por los duplicados.
    expect(
      indices.find(
        (i) => JSON.stringify(i.key) === '{"tipo":1,"candidatoId":1}',
      ),
    ).toBeUndefined();

    const postulantes = await conexion.collection('postulantes').indexes();
    expect(postulantes.length).toBeGreaterThan(1);

    const texto = lineas.join('\n');
    expect(texto).toContain('sincronizando índices de 2 modelo(s)');
    expect(texto).toMatch(
      /ADVERTENCIA: índice único .* de NotificacionApp no se creó porque ya hay duplicados/,
    );
    expect(texto).toMatch(/índices listos: \d+ ok, 1 con advertencia/);
  });

  it('es idempotente: una segunda pasada no rompe nada', async () => {
    const r = await sincronizarIndices(conexion, log);
    expect(r.fallidos).toHaveLength(1); // solo el duplicado, que sigue ahí
  });

  it('al limpiar los duplicados, la siguiente pasada crea el índice único', async () => {
    const [primero] = await conexion
      .collection('notificaciones_app')
      .find()
      .toArray();
    await conexion
      .collection('notificaciones_app')
      .deleteMany({ _id: { $ne: primero._id } });
    const r = await sincronizarIndices(conexion, log);
    expect(r.fallidos).toHaveLength(0);
    const indices = await conexion.collection('notificaciones_app').indexes();
    expect(
      indices.find(
        (i) => JSON.stringify(i.key) === '{"tipo":1,"candidatoId":1}',
      ),
    ).toMatchObject({ unique: true });
  });

  it('en segundo plano nunca rechaza, aunque falle todo', async () => {
    const rota = {
      get models() {
        throw new Error('conexión rota');
      },
    } as unknown as Connection;
    await expect(
      sincronizarIndicesEnSegundoPlano(rota, log),
    ).resolves.toBeUndefined();
    expect(lineas.join('\n')).toContain(
      'ERROR inesperado sincronizando índices: conexión rota',
    );
  });

  it('mensajes por tipo de fallo', () => {
    expect(
      mensajeFallo(
        'X',
        'i',
        Object.assign(new Error('E11000 dup'), { code: 11000 }),
      ),
    ).toContain('ya hay duplicados');
    expect(
      mensajeFallo(
        'Usuario',
        'email_1',
        Object.assign(new Error('x'), { code: 86 }),
      ),
    ).toContain(
      'ya existe con otras opciones (código 86); se conserva el actual',
    );
    expect(
      mensajeFallo('X', 'i', Object.assign(new Error('boom'), { code: 13 })),
    ).toContain('falló (13): boom');
  });
});

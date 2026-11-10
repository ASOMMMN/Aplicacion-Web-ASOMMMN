import { NotFoundException } from '@nestjs/common';
import { Connection, Model, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { NotificacionesAppService } from './notificaciones-app.service';
import {
  NotificacionApp,
  NotificacionAppDocument,
  NotificacionAppSchema,
  TTL_NOTIFICACION_APP_SEGUNDOS,
} from './schemas/notificacion-app.schema';
import {
  Usuario,
  UsuarioDocument,
  UsuarioSchema,
} from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteDocument,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';

/** Campanita de evaluadores/admins, contra un MongoDB real en memoria. */
jest.setTimeout(120_000);

describe('NotificacionesAppService (MongoDB en memoria)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let notificacionModel: Model<NotificacionAppDocument>;
  let usuarioModel: Model<UsuarioDocument>;
  let postulanteModel: Model<PostulanteDocument>;
  let servicio: NotificacionesAppService;

  let evaluador: string;
  let admin: string;
  let otroEvaluador: string;
  let postulanteUsuario: string;

  const crearUsuario = async (
    rol: 'postulante' | 'evaluador' | 'administrador',
    extra: Record<string, unknown> = {},
  ) => {
    const u = await usuarioModel.create({
      email: `${rol}-${new Types.ObjectId().toHexString()}@x.mx`,
      passwordHash: 'x',
      nombre: rol,
      apellidos: 'Prueba',
      rol,
      estadoCuenta: 'activa',
      ...extra,
    });
    return String(u._id);
  };

  const crearPostulante = async () => {
    const p = await postulanteModel.create({
      usuarioId: new Types.ObjectId(),
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });
    return p._id;
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    conexion = await createConnection(mongod.getUri()).asPromise();
    notificacionModel = conexion.model<NotificacionAppDocument>(
      NotificacionApp.name,
      NotificacionAppSchema,
    );
    usuarioModel = conexion.model<UsuarioDocument>(Usuario.name, UsuarioSchema);
    postulanteModel = conexion.model<PostulanteDocument>(
      Postulante.name,
      PostulanteSchema,
    );
    await notificacionModel.syncIndexes();
    servicio = new NotificacionesAppService(
      notificacionModel,
      usuarioModel,
      postulanteModel,
    );
  });

  afterAll(async () => {
    await conexion?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      notificacionModel.deleteMany({}),
      usuarioModel.deleteMany({}),
      postulanteModel.deleteMany({}),
    ]);
    evaluador = await crearUsuario('evaluador');
    admin = await crearUsuario('administrador');
    otroEvaluador = await crearUsuario('evaluador');
    postulanteUsuario = await crearUsuario('postulante');
    // Un evaluador eliminado no recibe avisos.
    await crearUsuario('evaluador', { isDeleted: true });
  });

  describe('creación', () => {
    it('nuevo_candidato llega a evaluadores y admins (no a postulantes ni eliminados)', async () => {
      const candidato = await crearPostulante();
      await expect(
        servicio.notificarNuevoCandidato(candidato, 'Ana Pérez'),
      ).resolves.toBe(true);

      const docs = await notificacionModel.find().lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].tipo).toBe('nuevo_candidato');
      expect(docs[0].destinatarios.map(String).sort()).toEqual(
        [evaluador, admin, otroEvaluador].sort(),
      );

      for (const uid of [evaluador, admin, otroEvaluador]) {
        const { items, noLeidas } = await servicio.listarMias(uid);
        expect(noLeidas).toBe(1);
        expect(items[0]).toMatchObject({
          tipo: 'nuevo_candidato',
          nombreCandidato: 'Ana Pérez',
          mensaje: 'Ana Pérez se registró como postulante.',
          enlace: `/candidato/${String(candidato)}`,
          leida: false,
        });
        expect(items[0].fecha).toBeInstanceOf(Date);
      }
      const delPostulante = await servicio.listarMias(postulanteUsuario);
      expect(delPostulante.total).toBe(0);
    });

    it('expediente_completo lleva enlace y mensaje del 100 %', async () => {
      const candidato = await crearPostulante();
      await servicio.notificarExpedienteCompleto(String(candidato), 'Luis Mar');
      const { items } = await servicio.listarMias(admin);
      expect(items[0]).toMatchObject({
        tipo: 'expediente_completo',
        mensaje: 'Luis Mar completó su expediente (100 %).',
        enlace: `/candidato/${String(candidato)}`,
      });
    });

    it('la respuesta no expone destinatarios ni quién más la leyó', async () => {
      await servicio.notificarNuevoCandidato(await crearPostulante(), 'X');
      const { items } = await servicio.listarMias(evaluador);
      expect(items[0]).not.toHaveProperty('destinatarios');
      expect(items[0]).not.toHaveProperty('leidaPor');
    });
  });

  describe('deduplicación de expediente_completo', () => {
    it('se genera una sola vez aunque guarde/envíe varias veces', async () => {
      const candidato = await crearPostulante();
      await expect(
        servicio.notificarExpedienteCompleto(candidato, 'Ana'),
      ).resolves.toBe(true);
      await expect(
        servicio.notificarExpedienteCompleto(candidato, 'Ana'),
      ).resolves.toBe(false);
      expect(
        await notificacionModel.countDocuments({ tipo: 'expediente_completo' }),
      ).toBe(1);
      const p = await postulanteModel.findById(candidato).lean();
      expect(p?.expedienteCompletoNotificadoEn).toBeInstanceOf(Date);
    });

    it('dos envíos simultáneos crean una sola notificación', async () => {
      const candidato = await crearPostulante();
      const resultados = await Promise.all(
        Array.from({ length: 5 }, () =>
          servicio.notificarExpedienteCompleto(candidato, 'Ana'),
        ),
      );
      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect(
        await notificacionModel.countDocuments({ tipo: 'expediente_completo' }),
      ).toBe(1);
    });

    it('no se repite aunque el TTL ya haya borrado la notificación', async () => {
      const candidato = await crearPostulante();
      await servicio.notificarExpedienteCompleto(candidato, 'Ana');
      await notificacionModel.deleteMany({}); // simula el TTL de 60 días
      await expect(
        servicio.notificarExpedienteCompleto(candidato, 'Ana'),
      ).resolves.toBe(false);
      expect(await notificacionModel.countDocuments()).toBe(0);
    });

    it('cada candidato tiene su propio aviso', async () => {
      await servicio.notificarExpedienteCompleto(await crearPostulante(), 'A');
      await servicio.notificarExpedienteCompleto(await crearPostulante(), 'B');
      expect(await notificacionModel.countDocuments()).toBe(2);
    });

    it('nuevo_candidato no se deduplica (cada registro es un evento)', async () => {
      const candidato = await crearPostulante();
      await servicio.notificarNuevoCandidato(candidato, 'A');
      await servicio.notificarExpedienteCompleto(candidato, 'A');
      expect(await notificacionModel.countDocuments()).toBe(2);
    });
  });

  describe('lectura por usuario', () => {
    it('marcar una como leída no afecta a los demás evaluadores', async () => {
      await servicio.notificarNuevoCandidato(await crearPostulante(), 'Ana');
      const { items } = await servicio.listarMias(evaluador);

      await servicio.marcarLeida(evaluador, items[0]._id);
      await servicio.marcarLeida(evaluador, items[0]._id); // idempotente

      const mia = await servicio.listarMias(evaluador);
      expect(mia.noLeidas).toBe(0);
      expect(mia.items[0].leida).toBe(true);

      const delOtro = await servicio.listarMias(otroEvaluador);
      expect(delOtro.noLeidas).toBe(1);
      expect(delOtro.items[0].leida).toBe(false);
    });

    it('marcar todas solo toca las mías', async () => {
      await servicio.notificarNuevoCandidato(await crearPostulante(), 'A');
      await servicio.notificarExpedienteCompleto(await crearPostulante(), 'B');

      const r = await servicio.marcarTodasLeidas(admin);
      expect(r.actualizadas).toBe(2);
      expect((await servicio.listarMias(admin)).noLeidas).toBe(0);
      expect((await servicio.listarMias(evaluador)).noLeidas).toBe(2);
      expect((await servicio.marcarTodasLeidas(admin)).actualizadas).toBe(0);
    });

    it('sin IDOR: no puede marcar una notificación que no es suya', async () => {
      await servicio.notificarNuevoCandidato(await crearPostulante(), 'Ana');
      const { items } = await servicio.listarMias(evaluador);

      await expect(
        servicio.marcarLeida(postulanteUsuario, items[0]._id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        servicio.marcarLeida(evaluador, new Types.ObjectId().toHexString()),
      ).rejects.toBeInstanceOf(NotFoundException);

      const doc = await notificacionModel.findById(items[0]._id).lean();
      expect(doc?.leidaPor).toHaveLength(0);
    });

    it('un usuario creado después no ve avisos anteriores', async () => {
      await servicio.notificarNuevoCandidato(await crearPostulante(), 'Ana');
      const nuevo = await crearUsuario('evaluador');
      expect((await servicio.listarMias(nuevo)).total).toBe(0);
    });

    it('paginado, más recientes primero', async () => {
      for (let i = 0; i < 5; i++) {
        await notificacionModel.create({
          tipo: 'nuevo_candidato',
          candidatoId: new Types.ObjectId(),
          nombreCandidato: `C${i}`,
          destinatarios: [new Types.ObjectId(evaluador)],
          creadaEn: new Date(Date.UTC(2026, 10, 1 + i)),
        });
      }
      const p1 = await servicio.listarMias(evaluador, 1, 2);
      expect(p1.items.map((i) => i.nombreCandidato)).toEqual(['C4', 'C3']);
      expect(p1).toMatchObject({ total: 5, noLeidas: 5, pagina: 1, limite: 2 });
      const p3 = await servicio.listarMias(evaluador, 3, 2);
      expect(p3.items.map((i) => i.nombreCandidato)).toEqual(['C0']);
      // límite acotado a 50
      expect((await servicio.listarMias(evaluador, 1, 500)).limite).toBe(50);
    });
  });

  describe('índices y TTL', () => {
    it('declara TTL de 60 días sobre creadaEn', () => {
      expect(TTL_NOTIFICACION_APP_SEGUNDOS).toBe(60 * 24 * 60 * 60);
      const ttl = NotificacionAppSchema.indexes().find(
        ([campos]) => Object.keys(campos).join() === 'creadaEn',
      );
      expect(ttl?.[1]).toMatchObject({
        expireAfterSeconds: TTL_NOTIFICACION_APP_SEGUNDOS,
      });
    });

    it('MongoDB tiene los índices: TTL, por destinatario y único parcial', async () => {
      const indices = await notificacionModel.collection.indexes();
      const porClave = (k: Record<string, number>) =>
        indices.find((i) => JSON.stringify(i.key) === JSON.stringify(k));

      expect(porClave({ creadaEn: 1 })?.expireAfterSeconds).toBe(
        TTL_NOTIFICACION_APP_SEGUNDOS,
      );
      expect(porClave({ destinatarios: 1, creadaEn: -1 })).toBeDefined();
      expect(porClave({ tipo: 1, candidatoId: 1 })).toMatchObject({
        unique: true,
        partialFilterExpression: { tipo: 'expediente_completo' },
      });
    });
  });
});

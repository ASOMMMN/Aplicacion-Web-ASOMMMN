import { Logger } from '@nestjs/common';
import { Connection, Model, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { AuthService } from './auth.service';
import { NotificacionesAppService } from '../notificaciones/notificaciones-app.service';
import {
  NotificacionApp,
  NotificacionAppDocument,
  NotificacionAppSchema,
} from '../notificaciones/schemas/notificacion-app.schema';
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

/**
 * Regresión: en producción ningún registro generaba el aviso "nuevo
 * candidato". El upsert del perfil mandaba `actualizadoEn` en $setOnInsert y
 * Mongoose (timestamps) agrega `$set.actualizadoEn`: MongoDB rechazaba el
 * update (código 40) y el aviso nunca se creaba. Los specs anteriores
 * simulaban el modelo y no lo veían; este corre contra un MongoDB real,
 * conectado como en producción (sin autoIndex ni autoCreate).
 */
jest.setTimeout(120_000);

describe('Registro → aviso "nuevo candidato" (MongoDB real, modo producción)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let usuarioModel: Model<UsuarioDocument>;
  let postulanteModel: Model<PostulanteDocument>;
  let notificacionModel: Model<NotificacionAppDocument>;
  let notificacionesApp: NotificacionesAppService;
  let auth: AuthService;

  const ids: Record<string, string> = {};

  const registrar = (email: string) =>
    auth.registrar({
      email,
      password: 'Secreta#2026',
      nombre: 'Ana',
      apellidos: 'Pérez',
    });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    // Igual que config/mongoose.config.ts con NODE_ENV=production.
    conexion = await createConnection(mongod.getUri('prod_sim'), {
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    usuarioModel = conexion.model<UsuarioDocument>(Usuario.name, UsuarioSchema);
    postulanteModel = conexion.model<PostulanteDocument>(
      Postulante.name,
      PostulanteSchema,
    );
    notificacionModel = conexion.model<NotificacionAppDocument>(
      NotificacionApp.name,
      NotificacionAppSchema,
    );
    notificacionesApp = new NotificacionesAppService(
      notificacionModel,
      usuarioModel,
      postulanteModel,
    );
    auth = new AuthService(
      usuarioModel,
      {} as never, // refreshTokenModel
      {} as never, // oneTimeTokenModel
      {} as never, // jwtService
      { get: (_k: string, def?: unknown) => def } as never,
      { avisosEvaluadorPorCorreo: false } as never,
      {} as never, // mfaService
      {} as never, // auditoria
      postulanteModel,
      notificacionesApp,
    );

    // Cuentas como se crean hoy.
    const crear = async (
      rol: 'postulante' | 'evaluador' | 'administrador',
      extra: Record<string, unknown> = {},
    ) =>
      String(
        (
          await usuarioModel.create({
            email: `${rol}-${new Types.ObjectId().toHexString()}@x.mx`,
            passwordHash: 'x',
            nombre: rol,
            apellidos: 'Prueba',
            rol,
            estadoCuenta: 'activa',
            ...extra,
          })
        )._id,
      );
    ids.evaluador = await crear('evaluador');
    ids.admin = await crear('administrador');
    ids.postulante = await crear('postulante');
    ids.eliminado = await crear('evaluador', { isDeleted: true });

    // Cuentas viejas / del seed, insertadas en crudo (sin pasar por el
    // esquema): sin isDeleted, estadoCuenta, emailVerificado ni creadoEn, y
    // una con otra capitalización del rol.
    const viejo = await usuarioModel.collection.insertOne({
      email: 'viejo@asommmn.test',
      passwordHash: 'x',
      nombre: 'Viejo',
      apellidos: 'Seed',
      rol: 'evaluador',
    });
    ids.viejo = String(viejo.insertedId);
    const mayus = await usuarioModel.collection.insertOne({
      email: 'mayus@asommmn.test',
      passwordHash: 'x',
      nombre: 'Mayus',
      apellidos: 'Seed',
      rol: 'Administrador',
    });
    ids.mayus = String(mayus.insertedId);
  });

  afterAll(async () => {
    await conexion?.close();
    await mongod?.stop();
  });

  it('evidencia: el upsert anterior (actualizadoEn en $setOnInsert) lo rechaza MongoDB', async () => {
    const ahora = new Date();
    await expect(
      postulanteModel
        .findOneAndUpdate(
          { usuarioId: new Types.ObjectId() },
          {
            $setOnInsert: {
              estadoPostulacion: 'en_proceso',
              creadoEn: ahora,
              actualizadoEn: ahora,
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec(),
    ).rejects.toMatchObject({ code: 40 });
  });

  it('crea el perfil y el aviso aunque la colección no exista (autoCreate off)', async () => {
    const antes = await conexion
      .db!.listCollections({ name: 'notificaciones_app' })
      .toArray();
    expect(antes).toHaveLength(0);

    await registrar('ana@x.mx');

    const usuario = await usuarioModel.findOne({ email: 'ana@x.mx' }).lean();
    const perfil = await postulanteModel
      .findOne({ usuarioId: usuario!._id })
      .lean();
    expect(perfil).toBeTruthy();
    expect(perfil!.creadoEn).toBeInstanceOf(Date);
    expect(perfil!.actualizadoEn).toBeInstanceOf(Date);
    expect(perfil!.estadoPostulacion).toBe('en_proceso');

    const avisos = await notificacionModel.find().lean();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe('nuevo_candidato');
    expect(String(avisos[0].candidatoId)).toBe(String(perfil!._id));
    expect(avisos[0].destinatarios.map(String).sort()).toEqual(
      [ids.evaluador, ids.admin, ids.viejo, ids.mayus].sort(),
    );
  });

  it('la campanita lo lista a evaluador, admin y cuentas viejas, con no leídas', async () => {
    for (const quien of ['evaluador', 'admin', 'viejo', 'mayus']) {
      const lista = await notificacionesApp.listarMias(ids[quien]);
      expect({ quien, total: lista.total, noLeidas: lista.noLeidas }).toEqual({
        quien,
        total: 1,
        noLeidas: 1,
      });
      expect(lista.items[0].mensaje).toBe(
        'Ana Pérez se registró como postulante.',
      );
    }
    for (const quien of ['postulante', 'eliminado']) {
      expect((await notificacionesApp.listarMias(ids[quien])).total).toBe(0);
    }
  });

  it('"marcar leída" baja el contador solo de quien la marca', async () => {
    const [aviso] = (await notificacionesApp.listarMias(ids.evaluador)).items;
    await notificacionesApp.marcarLeida(ids.evaluador, aviso._id);

    const evaluador = await notificacionesApp.listarMias(ids.evaluador);
    expect(evaluador.noLeidas).toBe(0);
    expect(evaluador.items[0].leida).toBe(true);
    expect((await notificacionesApp.listarMias(ids.admin)).noLeidas).toBe(1);
  });

  it('el contador sube con un segundo registro', async () => {
    await registrar('beto@x.mx');
    expect((await notificacionesApp.listarMias(ids.evaluador)).noLeidas).toBe(
      1,
    );
    expect((await notificacionesApp.listarMias(ids.admin)).noLeidas).toBe(2);
  });

  it('si el perfil no se puede crear, lo registra como error y el registro sigue', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const upsert = jest
      .spyOn(postulanteModel, 'findOneAndUpdate')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('fallo simulado'), { code: 40 });
      });
    try {
      await expect(registrar('caro@x.mx')).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(
          'no se pudo crear el perfil de postulante (código 40)',
        ),
        expect.anything(),
      );
    } finally {
      upsert.mockRestore();
      error.mockRestore();
    }
  });

  it('diagnóstico: cuenta destinatarios e indica si un correo entra, sin escribir', async () => {
    const contar = async () => ({
      usuarios: await usuarioModel.countDocuments(),
      postulantes: await postulanteModel.countDocuments(),
      avisos: await notificacionModel.countDocuments(),
    });
    const antes = await contar();

    const d = await notificacionesApp.diagnosticar('VIEJO@asommmn.test ');

    expect(await contar()).toEqual(antes);
    expect(d.soloLectura).toBe(true);
    expect(d.destinatarios).toEqual({
      total: 4,
      porRol: { evaluador: 2, administrador: 1, Administrador: 1 },
    });
    expect(d.consulta).toEqual({
      email: 'viejo@asommmn.test',
      incluida: true,
      cuentas: [
        {
          usuarioId: ids.viejo,
          rol: 'evaluador',
          eliminada: false,
          incluida: true,
        },
      ],
    });
    expect(d.coleccion.existe).toBe(true);
    expect(d.coleccion.avisosPorTipo).toEqual({ nuevo_candidato: 2 });
    // "caro" quedó sin perfil por el fallo simulado.
    expect(d.postulantesSinPerfil).toBe(2); // ids.postulante + caro

    const noExiste = await notificacionesApp.diagnosticar('nadie@x.mx');
    expect(noExiste.consulta).toEqual({
      email: 'nadie@x.mx',
      incluida: false,
      cuentas: [],
    });
  });
});

import { Logger } from '@nestjs/common';
import { Connection, Model, Types, createConnection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  NotificacionesAppService,
  etiquetaDia,
  resumenGrupo,
} from './notificaciones-app.service';
import {
  NotificacionApp,
  NotificacionAppDocument,
  NotificacionAppSchema,
  type TipoNotificacionApp,
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
import { REQUISITOS_EXPEDIENTE } from '../postulantes/constants/expediente.constants';

/**
 * Campanita fase 1: documento_subido, expediente_evaluado, candidato_inactivo,
 * agrupación por día y filtros. MongoDB real, conectado como en producción
 * (sin autoIndex ni autoCreate); los índices se crean como lo hace el
 * arranque en segundo plano.
 */
jest.setTimeout(120_000);

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
// 11 nov 2026, 12:00 en México (UTC-6).
const AHORA = new Date('2026-11-11T18:00:00.000Z');

describe('Campanita fase 1 (MongoDB real, modo producción)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let notificacionModel: Model<NotificacionAppDocument>;
  let usuarioModel: Model<UsuarioDocument>;
  let postulanteModel: Model<PostulanteDocument>;
  let servicio: NotificacionesAppService;

  let evaluador: string;
  let admin: string;
  let otroEvaluador: string;

  const logs: string[] = [];
  const espias: jest.SpyInstance[] = [];

  const crearUsuario = async (
    rol: 'postulante' | 'evaluador' | 'administrador',
    extra: Record<string, unknown> = {},
  ) => {
    const u = new usuarioModel({
      email: `${rol}-${new Types.ObjectId().toHexString()}@correo-privado.mx`,
      passwordHash: 'x',
      nombre: 'Ana',
      apellidos: 'Pérez',
      rol,
      estadoCuenta: 'activa',
      ...extra,
    });
    await u.save();
    return String(u._id);
  };

  /** Usuario postulante + su perfil. */
  const crearCandidato = async (
    extraUsuario: Record<string, unknown> = {},
    extraPerfil: Record<string, unknown> = {},
  ) => {
    const usuarioId = await crearUsuario('postulante', extraUsuario);
    const perfil = await postulanteModel.create({
      usuarioId: new Types.ObjectId(usuarioId),
      ...extraPerfil,
    });
    // Fechas de alta en el pasado (los timestamps ponen "ahora").
    const creadoEn = (extraUsuario.creadoEn as Date | undefined) ?? AHORA;
    await usuarioModel.updateOne(
      { _id: usuarioId },
      { $set: { creadoEn } },
      { timestamps: false },
    );
    await postulanteModel.updateOne(
      { _id: perfil._id },
      { $set: { creadoEn } },
      { timestamps: false },
    );
    return { usuarioId, candidatoId: perfil._id };
  };

  const avisos = (filtro: Record<string, unknown> = {}) =>
    notificacionModel.find(filtro).sort({ creadaEn: 1 }).lean();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    conexion = await createConnection(mongod.getUri('fase1'), {
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    notificacionModel = conexion.model<NotificacionAppDocument>(
      NotificacionApp.name,
      NotificacionAppSchema,
    );
    usuarioModel = conexion.model<UsuarioDocument>(Usuario.name, UsuarioSchema);
    postulanteModel = conexion.model<PostulanteDocument>(
      Postulante.name,
      PostulanteSchema,
    );
    // Lo que hace main.ts en segundo plano (ensureIndexes de cada modelo).
    await notificacionModel.ensureIndexes();
    await postulanteModel.ensureIndexes();
    servicio = new NotificacionesAppService(
      notificacionModel,
      usuarioModel,
      postulanteModel,
    );

    for (const nivel of ['log', 'warn', 'error'] as const) {
      espias.push(
        jest
          .spyOn(Logger.prototype, nivel)
          .mockImplementation((msg: unknown) => {
            logs.push(`${nivel}: ${String(msg)}`);
          }),
      );
    }
  });

  afterAll(async () => {
    espias.forEach((e) => e.mockRestore());
    await conexion?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    logs.length = 0;
    const db = conexion.db!;
    await Promise.all(
      [
        'usuarios',
        'postulantes',
        'notificaciones_app',
        'documentos',
        'docs_personales',
        'cursos',
      ].map((c) => db.collection(c).deleteMany({})),
    );
    evaluador = await crearUsuario('evaluador', {
      nombre: 'Juan',
      apellidos: 'López',
    });
    admin = await crearUsuario('administrador');
    otroEvaluador = await crearUsuario('evaluador');
    await crearUsuario('evaluador', { isDeleted: true });
  });

  // ── documento_subido ──────────────────────────────────────────────────────

  describe('documento_subido', () => {
    it('crea el aviso para evaluadores y admins, con la etiqueta del documento', async () => {
      const { usuarioId, candidatoId } = await crearCandidato();
      await expect(
        servicio.avisarDocumentoSubido(usuarioId, 'CURP', AHORA),
      ).resolves.toBe(true);

      const [aviso] = await avisos();
      expect(aviso).toMatchObject({
        tipo: 'documento_subido',
        cantidad: 1,
        documentos: ['CURP'],
        nombreCandidato: 'Ana Pérez',
      });
      expect(aviso.destinatarios.map(String).sort()).toEqual(
        [evaluador, admin, otroEvaluador].sort(),
      );
      const { items } = await servicio.listarMias(admin, {}, AHORA);
      expect(items[0]).toMatchObject({
        mensaje: 'Ana Pérez subió un documento: CURP.',
        enlace: `/candidato/${String(candidatoId)}`,
        cantidad: 1,
        leida: false,
      });
    });

    it('agrupa las subidas del mismo candidato dentro de 10 min y vuelve a quedar sin leer', async () => {
      const { usuarioId } = await crearCandidato();
      await servicio.avisarDocumentoSubido(usuarioId, 'CURP', AHORA);

      const [primero] = (await servicio.listarMias(evaluador, {}, AHORA)).items;
      await servicio.marcarLeida(evaluador, primero._id);

      await servicio.avisarDocumentoSubido(
        usuarioId,
        'INE / Credencial de elector',
        new Date(AHORA.getTime() + 4 * MIN),
      );
      // Ventana deslizante: 9 min después de la última subida sigue juntando.
      await servicio.avisarDocumentoSubido(
        usuarioId,
        'CURP',
        new Date(AHORA.getTime() + 13 * MIN),
      );

      const todos = await avisos();
      expect(todos).toHaveLength(1);
      expect(todos[0].cantidad).toBe(3);
      expect(todos[0].creadaEn).toEqual(AHORA);
      expect(todos[0].actualizadaEn).toEqual(
        new Date(AHORA.getTime() + 13 * MIN),
      );

      const mio = await servicio.listarMias(evaluador, {}, AHORA);
      expect(mio.noLeidas).toBe(1); // había nuevo: otra vez sin leer
      expect(mio.items[0]).toMatchObject({
        mensaje:
          'Ana Pérez subió 3 documentos: CURP, INE / Credencial de elector.',
        documentos: ['CURP', 'INE / Credencial de elector'],
        cantidad: 3,
        leida: false,
      });
      expect(mio.items[0].fecha).toEqual(new Date(AHORA.getTime() + 13 * MIN));
    });

    it('pasada la ventana crea otro aviso; otro candidato tiene el suyo', async () => {
      const a = await crearCandidato();
      const b = await crearCandidato({ nombre: 'Luis', apellidos: 'Mar' });
      await servicio.avisarDocumentoSubido(a.usuarioId, 'CURP', AHORA);
      await servicio.avisarDocumentoSubido(b.usuarioId, 'INE', AHORA);
      await servicio.avisarDocumentoSubido(
        a.usuarioId,
        'Pasaporte',
        new Date(AHORA.getTime() + 11 * MIN),
      );
      const todos = await avisos();
      expect(todos).toHaveLength(3);
      expect(todos.map((t) => t.cantidad)).toEqual([1, 1, 1]);
    });

    it('subidas simultáneas no duplican el aviso', async () => {
      const { usuarioId } = await crearCandidato();
      const r = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          servicio.avisarDocumentoSubido(usuarioId, `Doc ${i}`, AHORA),
        ),
      );
      expect(r.every(Boolean)).toBe(true);
      const todos = await avisos();
      expect(todos).toHaveLength(1);
      expect(todos[0].cantidad).toBe(6);
    });

    it('sin perfil de postulante no crea nada y lo registra', async () => {
      const sinPerfil = await crearUsuario('postulante');
      await expect(
        servicio.avisarDocumentoSubido(sinPerfil, 'CURP', AHORA),
      ).resolves.toBe(false);
      expect(await notificacionModel.countDocuments()).toBe(0);
      expect(logs.some((l) => /warn: .*no tiene perfil/.test(l))).toBe(true);
    });

    it('si algo falla no lanza (la subida sigue) pero registra el error', async () => {
      const { usuarioId } = await crearCandidato();
      const falla = jest
        .spyOn(notificacionModel, 'create')
        .mockRejectedValueOnce(new Error('disco lleno'));
      await expect(
        servicio.avisarDocumentoSubido(usuarioId, 'CURP', AHORA),
      ).resolves.toBe(false);
      falla.mockRestore();
      expect(
        logs.some((l) => /error: .*falló el insert.*disco lleno/.test(l)),
      ).toBe(true);
      expect(
        logs.some((l) =>
          /error: \[documento_subido\].*no se pudo registrar/.test(l),
        ),
      ).toBe(true);
    });
  });

  // ── expediente_evaluado ──────────────────────────────────────────────────

  describe('expediente_evaluado', () => {
    it('llega a los demás evaluadores y admins, no a quien decidió', async () => {
      const { candidatoId } = await crearCandidato();
      await expect(
        servicio.avisarExpedienteEvaluado({
          candidatoId,
          nombreCandidato: 'Ana Pérez',
          decision: 'completado',
          actorId: evaluador,
          actorNombre: 'Juan López',
        }),
      ).resolves.toBe(true);

      const [aviso] = await avisos();
      expect(aviso.destinatarios.map(String).sort()).toEqual(
        [admin, otroEvaluador].sort(),
      );
      expect(String(aviso.actorId)).toBe(evaluador);
      expect((await servicio.listarMias(evaluador)).total).toBe(0);
      const { items } = await servicio.listarMias(admin);
      expect(items[0]).toMatchObject({
        tipo: 'expediente_evaluado',
        decision: 'completado',
        actorNombre: 'Juan López',
        mensaje: 'Juan López aprobó a Ana Pérez.',
        enlace: `/candidato/${String(candidatoId)}`,
      });
    });

    it.each([
      ['rechazado', 'Juan López rechazó a Ana Pérez.'],
      ['en_proceso', 'Juan López regresó a Ana Pérez a "En proceso".'],
    ] as const)('decisión %s → "%s"', async (decision, mensaje) => {
      const { candidatoId } = await crearCandidato();
      await servicio.avisarExpedienteEvaluado({
        candidatoId,
        nombreCandidato: 'Ana Pérez',
        decision,
        actorId: evaluador,
        actorNombre: 'Juan López',
      });
      expect((await servicio.listarMias(admin)).items[0].mensaje).toBe(mensaje);
    });

    it('si quien decide es el único evaluador, no hay aviso y se registra', async () => {
      await usuarioModel.deleteMany({ _id: { $ne: evaluador } });
      const { candidatoId } = await crearCandidato();
      await expect(
        servicio.avisarExpedienteEvaluado({
          candidatoId,
          nombreCandidato: 'Ana',
          decision: 'rechazado',
          actorId: evaluador,
          actorNombre: 'Juan',
        }),
      ).resolves.toBe(false);
      expect(await notificacionModel.countDocuments()).toBe(0);
      expect(
        logs.some((l) =>
          /warn: \[expediente_evaluado\].*0 destinatarios.*se excluye/.test(l),
        ),
      ).toBe(true);
    });
  });

  // ── candidato_inactivo ───────────────────────────────────────────────────

  describe('candidato_inactivo', () => {
    const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA);
    const db = () => conexion.db!;

    const completar = async (candidatoId: Types.ObjectId, subidasEn: Date) => {
      await db().collection('documentos').insertOne({
        postulanteId: candidatoId,
        esActual: true,
        subidasEn,
      });
      const tipos = REQUISITOS_EXPEDIENTE.filter(
        (r) => r.requerido && r.clave !== 'cv' && r.clave !== 'vacante',
      ).map((r) => r.clave);
      await db()
        .collection('docs_personales')
        .insertMany(
          tipos.map((tipo) => ({ postulanteId: candidatoId, tipo, subidasEn })),
        );
      await postulanteModel.updateOne(
        { _id: candidatoId },
        { $set: { vacante: 'Capitán' } },
      );
    };

    it('avisa una sola vez por candidato y periodo, aunque el TTL borre el aviso', async () => {
      const { candidatoId } = await crearCandidato({
        creadoEn: hace(20),
        ultimoAcceso: hace(9),
      });
      const antes = (await postulanteModel.findById(candidatoId).lean())!
        .actualizadoEn;

      const r1 = await servicio.revisarCandidatosInactivos(AHORA);
      expect(r1).toMatchObject({
        incompletos: 1,
        inactivos: 1,
        avisados: 1,
        errores: 0,
      });

      const [aviso] = await avisos();
      expect(aviso).toMatchObject({ tipo: 'candidato_inactivo' });
      expect(aviso.inactivoDesde).toEqual(hace(9));
      expect(aviso.destinatarios).toHaveLength(3);
      const { items } = await servicio.listarMias(evaluador, {}, AHORA);
      expect(items[0]).toMatchObject({
        mensaje:
          'Ana Pérez lleva 9 días sin actividad y su expediente está incompleto.',
        diasInactivo: 9,
      });

      const perfil = (await postulanteModel.findById(candidatoId).lean())!;
      expect(perfil.inactividadNotificadaDesde).toEqual(hace(9));
      expect(perfil.actualizadoEn).toEqual(antes); // la marca no es actividad

      // Al día siguiente, y aunque el TTL haya borrado el aviso: no se repite.
      await notificacionModel.deleteMany({});
      const r2 = await servicio.revisarCandidatosInactivos(
        new Date(AHORA.getTime() + DIA),
      );
      expect(r2.avisados).toBe(0);
      expect(await notificacionModel.countDocuments()).toBe(0);
    });

    it('vuelve a avisar solo si hubo actividad y otra vez 7 días sin moverse', async () => {
      const { candidatoId } = await crearCandidato({ creadoEn: hace(30) });
      await servicio.revisarCandidatosInactivos(AHORA);
      expect(await notificacionModel.countDocuments()).toBe(1);

      // Sube un curso 2 días después: activo de nuevo.
      const subida = new Date(AHORA.getTime() + 2 * DIA);
      await db().collection('cursos').insertOne({
        postulanteId: candidatoId,
        creadoEn: subida,
      });
      const r = await servicio.revisarCandidatosInactivos(
        new Date(subida.getTime() + 3 * DIA),
      );
      expect(r.avisados).toBe(0);

      const r2 = await servicio.revisarCandidatosInactivos(
        new Date(subida.getTime() + 8 * DIA),
      );
      expect(r2.avisados).toBe(1);
      expect(await notificacionModel.countDocuments()).toBe(2);
    });

    it('no avisa a activos, completos, enviados, decididos ni eliminados', async () => {
      // Activo: subió un documento hace 2 días.
      const activo = await crearCandidato({ creadoEn: hace(30) });
      await db()
        .collection('docs_personales')
        .insertOne({
          postulanteId: activo.candidatoId,
          tipo: 'CURP',
          subidasEn: hace(2),
        });
      // Completo pero sin enviar.
      const completo = await crearCandidato({ creadoEn: hace(30) });
      await completar(completo.candidatoId, hace(20));
      // Enviado y decididos.
      await crearCandidato(
        { creadoEn: hace(30) },
        { estadoExpediente: 'enviado' },
      );
      await crearCandidato(
        { creadoEn: hace(30) },
        { estadoPostulacion: 'rechazado' },
      );
      await crearCandidato(
        { creadoEn: hace(30) },
        { estadoPostulacion: 'completado' },
      );
      // Cuenta eliminada.
      await crearCandidato({ creadoEn: hace(30), isDeleted: true });
      // Nuevo (registrado hace 3 días).
      await crearCandidato({ creadoEn: hace(3) });

      const r = await servicio.revisarCandidatosInactivos(AHORA);
      expect(r).toMatchObject({ avisados: 0 });
      expect(r.incompletos).toBe(2); // activo y nuevo
      expect(await notificacionModel.countDocuments()).toBe(0);
    });

    it('sin evaluadores no se gasta la marca: avisa cuando ya hay a quién', async () => {
      await usuarioModel.deleteMany({ rol: { $ne: 'postulante' } });
      const { candidatoId } = await crearCandidato({ creadoEn: hace(10) });
      const r = await servicio.revisarCandidatosInactivos(AHORA);
      expect(r.avisados).toBe(0);
      expect(
        (await postulanteModel.findById(candidatoId).lean())!
          .inactividadNotificadaDesde,
      ).toBeUndefined();

      await crearUsuario('evaluador');
      const r2 = await servicio.revisarCandidatosInactivos(AHORA);
      expect(r2.avisados).toBe(1);
    });

    it('dos revisiones simultáneas crean un solo aviso', async () => {
      await crearCandidato({ creadoEn: hace(10) });
      await Promise.all([
        servicio.revisarCandidatosInactivos(AHORA),
        servicio.revisarCandidatosInactivos(AHORA),
      ]);
      expect(await notificacionModel.countDocuments()).toBe(1);
    });

    it('el cron registra el resumen y no deja escapar errores', async () => {
      await crearCandidato({ creadoEn: hace(10) });
      await servicio.revisarCandidatosInactivosCron();
      expect(
        logs.some((l) =>
          /log: \[candidato_inactivo\] revisión: .*1 aviso\(s\) nuevo\(s\)/.test(
            l,
          ),
        ),
      ).toBe(true);

      const falla = jest
        .spyOn(usuarioModel, 'find')
        .mockImplementationOnce(() => {
          throw new Error('sin conexión');
        });
      await expect(
        servicio.revisarCandidatosInactivosCron(),
      ).resolves.toBeUndefined();
      falla.mockRestore();
      expect(
        logs.some((l) =>
          /error: \[candidato_inactivo\] la revisión diaria falló.*sin conexión/.test(
            l,
          ),
        ),
      ).toBe(true);
    });
  });

  // ── Agrupación, filtros y lectura por usuario ────────────────────────────

  describe('agrupación por día y filtros', () => {
    const sembrar = async (
      tipo: TipoNotificacionApp,
      creadaEn: Date,
      extra: Record<string, unknown> = {},
    ) =>
      notificacionModel.create({
        tipo,
        candidatoId: new Types.ObjectId(),
        nombreCandidato: 'C',
        destinatarios: [evaluador, admin].map((x) => new Types.ObjectId(x)),
        creadaEn,
        ...extra,
      });

    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await sembrar('nuevo_candidato', new Date(AHORA.getTime() - i * MIN));
      }
      await sembrar(
        'expediente_completo',
        new Date(AHORA.getTime() - 30 * MIN),
      );
      await sembrar(
        'expediente_completo',
        new Date(AHORA.getTime() - 40 * MIN),
      );
      // 10 nov a las 21:00 en México = 11 nov 03:00 UTC: cuenta como AYER.
      await sembrar('nuevo_candidato', new Date('2026-11-11T03:00:00.000Z'));
    });

    it('junta los del mismo tipo y día en una línea resumida con su detalle', async () => {
      const r = await servicio.listarMias(evaluador, { agrupar: 'dia' }, AHORA);
      expect(r.items).toEqual([]);
      expect(r).toMatchObject({ total: 8, noLeidas: 8, totalGrupos: 3 });
      expect(
        r.grupos!.map((g) => [g.dia, g.tipo, g.cantidad, g.resumen]),
      ).toEqual([
        ['2026-11-11', 'nuevo_candidato', 5, '5 postulantes nuevos hoy'],
        ['2026-11-11', 'expediente_completo', 2, '2 expedientes completos hoy'],
        ['2026-11-10', 'nuevo_candidato', 1, '1 postulante nuevo ayer'],
      ]);
      const [hoy] = r.grupos!;
      expect(hoy.items).toHaveLength(5);
      expect(hoy.items[0].fecha).toEqual(AHORA); // más reciente primero
      expect(hoy).toMatchObject({ noLeidas: 5, hayMas: false });
      expect(hoy.items[0]).not.toHaveProperty('leidaPor');
    });

    it('pagina por grupo', async () => {
      const p1 = await servicio.listarMias(
        evaluador,
        { agrupar: 'dia', limite: 2 },
        AHORA,
      );
      expect(p1.grupos).toHaveLength(2);
      const p2 = await servicio.listarMias(
        evaluador,
        { agrupar: 'dia', limite: 2, pagina: 2 },
        AHORA,
      );
      expect(p2.grupos!.map((g) => g.resumen)).toEqual([
        '1 postulante nuevo ayer',
      ]);
    });

    it('un grupo grande trae 20 y el detalle completo sale con tipo + día', async () => {
      for (let i = 0; i < 20; i++) {
        await sembrar('documento_subido', new Date(AHORA.getTime() - 2 * MIN));
      }
      const r = await servicio.listarMias(evaluador, { agrupar: 'dia' }, AHORA);
      const docs = r.grupos!.find((g) => g.tipo === 'documento_subido')!;
      expect(docs).toMatchObject({ cantidad: 20, hayMas: false });
      await sembrar('documento_subido', new Date(AHORA.getTime() - 3 * MIN));
      const r2 = await servicio.listarMias(
        evaluador,
        { agrupar: 'dia' },
        AHORA,
      );
      const docs2 = r2.grupos!.find((g) => g.tipo === 'documento_subido')!;
      expect(docs2).toMatchObject({ cantidad: 21, hayMas: true });
      expect(docs2.items).toHaveLength(20);

      const detalle = await servicio.listarMias(evaluador, {
        tipo: 'documento_subido',
        dia: '2026-11-11',
        limite: 50,
      });
      expect(detalle.total).toBe(21);
      expect(detalle.items).toHaveLength(21);
    });

    it('filtro por día respeta la hora de México', async () => {
      const ayer = await servicio.listarMias(evaluador, { dia: '2026-11-10' });
      expect(ayer.total).toBe(1);
      expect(
        (await servicio.listarMias(evaluador, { dia: '2026-11-11' })).total,
      ).toBe(7);
    });

    it('solo no leídas; el contador de la insignia no depende del filtro', async () => {
      const { items } = await servicio.listarMias(evaluador, {
        tipo: 'expediente_completo',
      });
      await servicio.marcarLeida(evaluador, items[0]._id);

      const r = await servicio.listarMias(evaluador, { soloNoLeidas: true });
      expect(r.total).toBe(7);
      expect(r.items.every((i) => !i.leida)).toBe(true);
      const filtrado = await servicio.listarMias(evaluador, {
        soloNoLeidas: true,
        tipo: 'expediente_completo',
      });
      expect(filtrado.total).toBe(1);
      expect(filtrado.noLeidas).toBe(7);

      const g = await servicio.listarMias(
        evaluador,
        { agrupar: 'dia', soloNoLeidas: true },
        AHORA,
      );
      expect(
        g.grupos!.find((x) => x.tipo === 'expediente_completo'),
      ).toMatchObject({
        cantidad: 1,
        noLeidas: 1,
        resumen: '1 expediente completo hoy',
      });
      // El admin no se ve afectado por lo que leyó el evaluador.
      expect((await servicio.listarMias(admin)).noLeidas).toBe(8);
    });

    it('marcar todas de un grupo (tipo + día) solo toca ese grupo y solo las mías', async () => {
      const r = await servicio.marcarTodasLeidas(evaluador, {
        tipo: 'nuevo_candidato',
        dia: '2026-11-11',
      });
      expect(r.actualizadas).toBe(5);
      expect((await servicio.listarMias(evaluador)).noLeidas).toBe(3);
      expect((await servicio.listarMias(admin)).noLeidas).toBe(8);
      expect((await servicio.marcarTodasLeidas(evaluador)).actualizadas).toBe(
        3,
      );
    });

    it('sin IDOR: otro usuario no ve ni agrupa avisos ajenos', async () => {
      const postulante = await crearUsuario('postulante');
      const r = await servicio.listarMias(
        postulante,
        { agrupar: 'dia' },
        AHORA,
      );
      expect(r).toMatchObject({
        total: 0,
        noLeidas: 0,
        totalGrupos: 0,
        grupos: [],
      });
      expect((await servicio.marcarTodasLeidas(postulante)).actualizadas).toBe(
        0,
      );
      expect((await servicio.listarMias(otroEvaluador)).total).toBe(0);
    });
  });

  describe('textos', () => {
    it('etiquetaDia: hoy, ayer, fecha corta y con año si es otro', () => {
      expect(etiquetaDia('2026-11-11', AHORA)).toBe('hoy');
      expect(etiquetaDia('2026-11-10', AHORA)).toBe('ayer');
      expect(etiquetaDia('2026-11-03', AHORA)).toBe('el 3 nov');
      expect(etiquetaDia('2025-12-31', AHORA)).toBe('el 31 dic 2025');
      // 1 ene a las 00:30 en México: "ayer" es el 31 dic del año anterior.
      expect(
        etiquetaDia('2026-12-31', new Date('2027-01-01T06:30:00.000Z')),
      ).toBe('ayer');
    });

    it('resumenGrupo en singular y plural por tipo', () => {
      expect(resumenGrupo('nuevo_candidato', 5, '2026-11-11', AHORA)).toBe(
        '5 postulantes nuevos hoy',
      );
      expect(resumenGrupo('documento_subido', 1, '2026-11-11', AHORA)).toBe(
        '1 candidato subió documentos hoy',
      );
      expect(resumenGrupo('expediente_evaluado', 2, '2026-11-10', AHORA)).toBe(
        '2 expedientes evaluados ayer',
      );
      expect(resumenGrupo('candidato_inactivo', 3, '2026-11-03', AHORA)).toBe(
        '3 candidatos inactivos el 3 nov',
      );
    });
  });

  it('los logs dicen destinatarios y resultado sin nombres ni correos', async () => {
    const { usuarioId, candidatoId } = await crearCandidato();
    await servicio.avisarDocumentoSubido(usuarioId, 'CURP', AHORA);
    await servicio.avisarDocumentoSubido(usuarioId, 'INE', AHORA);
    await servicio.avisarExpedienteEvaluado({
      candidatoId,
      nombreCandidato: 'Ana Pérez',
      decision: 'completado',
      actorId: evaluador,
      actorNombre: 'Juan López',
    });
    const texto = logs.join('\n');
    expect(texto).toMatch(
      new RegExp(
        `\\[documento_subido\\] candidato ${String(candidatoId)}: 3 destinatario\\(s\\)`,
      ),
    );
    expect(texto).toMatch(
      /\[documento_subido\].*aviso guardado en notificaciones_app/,
    );
    expect(texto).toMatch(
      /\[documento_subido\].*se sumó al aviso .* \(2 subida\(s\)/,
    );
    expect(texto).toMatch(
      /\[expediente_evaluado\].*2 destinatario\(s\).*se excluye a quien lo originó/,
    );
    expect(texto).not.toMatch(/Ana|Pérez|Juan|López|@/);
  });
});

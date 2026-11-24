/**
 * Sin enumeración de cuentas: registro, login, recuperar contraseña y cambio
 * obligatorio responden igual (código y cuerpo) exista o no el correo, y con
 * tiempos parecidos.
 *
 * HTTP real (supertest) contra AuthController con AuthService real, MongoDB
 * en memoria y el mismo ValidationPipe y `trust proxy` que main.ts. Correo,
 * MFA, auditoría y campanita se simulan.
 */
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import * as os from 'node:os';
import request from 'supertest';
import type { App } from 'supertest/types';

import * as passwordUtil from '../../common/utils/password.util';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MFAService } from '../mfa/mfa.service';
import { NotificacionesAppService } from '../notificaciones/notificaciones-app.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import {
  Usuario,
  UsuarioDocument,
  UsuarioSchema,
} from '../usuarios/schemas/usuario.schema';
import { AuthController, MENSAJE_REGISTRO } from './auth.controller';
import { AuthService } from './auth.service';
import { ProteccionFuerzaBrutaService } from './proteccion-fuerza-bruta.service';
import { IntentoAuth, IntentoAuthSchema } from './schemas/intento-auth.schema';
import {
  OneTimeToken,
  OneTimeTokenSchema,
} from './schemas/one-time-token.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';

jest.setTimeout(240_000);

const CLAVE = 'Gaviota-Norte-42';

describe('Sin enumeración de cuentas (registro, login, recuperar)', () => {
  let mongod: MongoMemoryServer;
  let app: INestApplication<App>;
  let usuarios: Model<UsuarioDocument>;

  const correo = {
    enviarBienvenidaPostulante: jest.fn(() => Promise.resolve()),
    enviarAvisoRegistroDuplicado: jest.fn(() => Promise.resolve()),
    enviarResetPasswordEmail: jest.fn(() => Promise.resolve()),
    avisosEvaluadorPorCorreo: false,
  };

  /** IP distinta por petición: los contadores por IP no interfieren. */
  let n = 1;
  const ip = () => `10.30.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
  const http = () => request(app.getHttpServer());

  /** Deja correr lo que quedó en segundo plano. */
  const vaciarSegundoPlano = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };

  const crearUsuario = async (
    email: string,
    extra: Partial<Record<string, unknown>> = {},
  ) =>
    usuarios.create({
      email,
      passwordHash: await passwordUtil.hashPassword(CLAVE),
      nombre: 'Titular',
      apellidos: 'Prueba',
      rol: 'postulante',
      estadoCuenta: 'activa',
      ...extra,
    });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    const config: Record<string, string> = {
      JWT_SECRET: 'secreto-solo-para-pruebas',
      FRONTEND_URL: 'https://web.prueba.test',
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        // runtimeAdapters: ver test/utils/conexion-mongo-prueba.ts.
        MongooseModule.forRoot(mongod.getUri('sin_enumeracion'), {
          runtimeAdapters: { os },
        }),
        MongooseModule.forFeature([
          { name: Usuario.name, schema: UsuarioSchema },
          { name: RefreshToken.name, schema: RefreshTokenSchema },
          { name: OneTimeToken.name, schema: OneTimeTokenSchema },
          { name: Postulante.name, schema: PostulanteSchema },
          { name: IntentoAuth.name, schema: IntentoAuthSchema },
        ]),
        JwtModule.register({ secret: config.JWT_SECRET }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        ProteccionFuerzaBrutaService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, def?: unknown) => config[k] ?? def },
        },
        { provide: NotificacionesService, useValue: correo },
        {
          provide: NotificacionesAppService,
          useValue: { notificarNuevoCandidato: jest.fn(() => null) },
        },
        { provide: MFAService, useValue: {} },
        {
          provide: AuditoriaService,
          useValue: { registrar: jest.fn(() => Promise.resolve()) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    usuarios = moduleRef.get(getModelToken(Usuario.name));

    await crearUsuario('existe@prueba.mx');
    await crearUsuario('bloqueada@prueba.mx', { estadoCuenta: 'bloqueada' });
    await crearUsuario('eliminada@prueba.mx', { isDeleted: true });
    await crearUsuario('temporal@prueba.mx', { debeCambiarContrasena: true });
    // Cada correo admite 3 intentos de registro por hora: las pruebas que
    // repiten registros con correo existente usan cuentas propias.
    for (const email of [
      'reg-falla@prueba.mx',
      'reg-t0@prueba.mx',
      'reg-t1@prueba.mx',
      'reg-t2@prueba.mx',
    ]) {
      await crearUsuario(email);
    }
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  /** Código y cuerpo de una respuesta, para compararlas. */
  const forma = (res: request.Response) => ({
    status: res.status,
    body: res.body as unknown,
  });

  /** Mediana del tiempo de `fn` en ms. */
  const mediana = async (
    veces: number,
    fn: (i: number) => Promise<unknown>,
  ) => {
    const tiempos: number[] = [];
    for (let i = 0; i < veces; i++) {
      const t0 = performance.now();
      await fn(i);
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    return tiempos[Math.floor(veces / 2)];
  };

  describe('POST /auth/registro', () => {
    const registrar = (email: string) =>
      http()
        .post('/auth/registro')
        .set('X-Forwarded-For', ip())
        .send({ email, nombre: 'Ana', apellidos: 'López', password: CLAVE });

    it('responde igual con correo nuevo y con correo ya registrado', async () => {
      const nuevo = await registrar('nuevo1@prueba.mx');
      const existente = await registrar('existe@prueba.mx');

      expect(forma(nuevo)).toEqual(forma(existente));
      expect(forma(nuevo)).toEqual({
        status: 201,
        body: { message: MENSAJE_REGISTRO },
      });
    });

    it('con correo existente no cambia la cuenta y avisa al titular por correo', async () => {
      const antes = await usuarios
        .findOne({ email: 'existe@prueba.mx' })
        .lean();
      await registrar('existe@prueba.mx').expect(201);
      await vaciarSegundoPlano();

      const despues = await usuarios
        .findOne({ email: 'existe@prueba.mx' })
        .lean();
      expect(despues?.passwordHash).toBe(antes?.passwordHash);
      expect(despues?.nombre).toBe('Titular');
      expect(await usuarios.countDocuments({ email: 'existe@prueba.mx' })).toBe(
        1,
      );
      expect(correo.enviarAvisoRegistroDuplicado).toHaveBeenCalledWith(
        'existe@prueba.mx',
        'Titular',
        'https://web.prueba.test/login',
        'https://web.prueba.test/recuperar-contrasena',
      );
      expect(correo.enviarBienvenidaPostulante).not.toHaveBeenCalled();
    });

    it('con correo nuevo crea la cuenta (puede entrar de inmediato) y manda bienvenida', async () => {
      await registrar('nuevo2@prueba.mx').expect(201);
      await vaciarSegundoPlano();
      const user = await usuarios.findOne({ email: 'nuevo2@prueba.mx' }).lean();
      expect(user?.estadoCuenta).toBe('activa');
      expect(correo.enviarBienvenidaPostulante).toHaveBeenCalledWith(
        'nuevo2@prueba.mx',
        'Ana',
        'https://web.prueba.test/login',
      );
      expect(correo.enviarAvisoRegistroDuplicado).not.toHaveBeenCalled();

      await http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip())
        .send({ email: 'nuevo2@prueba.mx', password: CLAVE })
        .expect(200);
    });

    it('no espera los correos: responde aunque el envío no termine', async () => {
      correo.enviarAvisoRegistroDuplicado.mockImplementationOnce(
        () => new Promise(() => undefined),
      );
      correo.enviarBienvenidaPostulante.mockImplementationOnce(
        () => new Promise(() => undefined),
      );
      await registrar('existe@prueba.mx').timeout(5_000).expect(201);
      await registrar('nuevo3@prueba.mx').timeout(5_000).expect(201);
    });

    it('si el correo falla, la respuesta no cambia y el error queda en el log', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      correo.enviarAvisoRegistroDuplicado.mockRejectedValueOnce(
        new Error('proveedor caído'),
      );
      const res = await registrar('reg-falla@prueba.mx').expect(201);
      expect(res.body).toEqual({ message: MENSAJE_REGISTRO });
      await vaciarSegundoPlano();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('proveedor caído'),
        expect.anything(),
      );
    });

    it('tarda parecido con correo nuevo y con correo existente', async () => {
      const tNuevo = await mediana(3, (i) =>
        registrar(`tiempo${i}@prueba.mx`).expect(201),
      );
      const tExistente = await mediana(3, (i) =>
        registrar(`reg-t${i}@prueba.mx`).expect(201),
      );
      // Ambos calculan bcrypt (cientos de ms). Antes, el existente respondía
      // en unos pocos ms. Margen amplio para no depender de la máquina.
      expect(tExistente / tNuevo).toBeGreaterThan(0.5);
      expect(tExistente / tNuevo).toBeLessThan(2);
    });
  });

  describe('POST /auth/login', () => {
    const login = (email: string, password = 'Equivocada-123') =>
      http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip())
        .send({ email, password });

    it('correo inexistente, contraseña errónea, cuenta bloqueada o eliminada: misma respuesta', async () => {
      const casos = await Promise.all([
        login('noexiste@prueba.mx'),
        login('existe@prueba.mx'),
        login('bloqueada@prueba.mx'),
        login('eliminada@prueba.mx'),
      ]);
      for (const res of casos) {
        expect(forma(res)).toEqual(forma(casos[0]));
      }
      expect(casos[0].status).toBe(401);
    });

    it('sin cuenta compara contra un hash ficticio (mismo trabajo que con cuenta)', async () => {
      const ficticio = jest.spyOn(passwordUtil, 'compararContraHashFicticio');
      await login('noexiste2@prueba.mx').expect(401);
      expect(ficticio).toHaveBeenCalledTimes(1);
    });

    it('"cuenta bloqueada" solo se informa con la contraseña correcta', async () => {
      await login('bloqueada@prueba.mx', CLAVE).expect(403);
    });

    it('tarda parecido con correo inexistente y con contraseña errónea', async () => {
      const tNoExiste = await mediana(3, (i) =>
        login(`noexiste-t${i}@prueba.mx`).expect(401),
      );
      const tErronea = await mediana(3, () =>
        login('existe@prueba.mx').expect(401),
      );
      expect(tNoExiste / tErronea).toBeGreaterThan(0.5);
      expect(tNoExiste / tErronea).toBeLessThan(2);
    });
  });

  describe('POST /auth/recuperar-contrasena', () => {
    const recuperar = (email: string) =>
      http()
        .post('/auth/recuperar-contrasena')
        .set('X-Forwarded-For', ip())
        .send({ email });

    it('responde igual exista o no el correo', async () => {
      const existe = await recuperar('existe@prueba.mx');
      const noExiste = await recuperar('noexiste3@prueba.mx');
      const bloqueada = await recuperar('bloqueada@prueba.mx');
      expect(forma(existe)).toEqual(forma(noExiste));
      expect(forma(bloqueada)).toEqual(forma(noExiste));
      expect(existe.status).toBe(200);

      await vaciarSegundoPlano();
      expect(correo.enviarResetPasswordEmail).toHaveBeenCalledTimes(1);
      expect(correo.enviarResetPasswordEmail).toHaveBeenCalledWith(
        'existe@prueba.mx',
        'Titular',
        expect.stringContaining(
          'https://web.prueba.test/restablecer-contrasena?token=',
        ),
      );
    });

    it('no espera el correo: responde aunque el envío no termine', async () => {
      correo.enviarResetPasswordEmail.mockImplementationOnce(
        () => new Promise(() => undefined),
      );
      await recuperar('temporal@prueba.mx').timeout(5_000).expect(200);
    });
  });

  describe('POST /auth/cambiar-contrasena-obligatoria', () => {
    const cambiar = (email: string, passwordTemporal = 'Equivocada-123') =>
      http()
        .post('/auth/cambiar-contrasena-obligatoria')
        .set('X-Forwarded-For', ip())
        .send({ email, passwordTemporal, nuevaPassword: 'Faro-Del-Sur-77' });

    it('correo inexistente, temporal errónea o cuenta sin cambio pendiente: misma respuesta', async () => {
      const casos = await Promise.all([
        cambiar('noexiste4@prueba.mx'),
        cambiar('temporal@prueba.mx'),
        cambiar('existe@prueba.mx'),
      ]);
      for (const res of casos) {
        expect(forma(res)).toEqual(forma(casos[0]));
      }
      expect(casos[0].status).toBe(401);
    });
  });
});

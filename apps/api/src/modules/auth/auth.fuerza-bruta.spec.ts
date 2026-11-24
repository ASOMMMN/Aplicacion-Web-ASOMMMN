import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { conectarMongoPrueba } from '../../../test/utils/conexion-mongo-prueba';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  POLITICAS,
  ProteccionFuerzaBrutaService,
} from './proteccion-fuerza-bruta.service';
import {
  IntentoAuth,
  IntentoAuthDocument,
  IntentoAuthSchema,
} from './schemas/intento-auth.schema';

/**
 * S-01 (AUDITORIA.md): rate limiting y bloqueo temporal por intentos
 * fallidos en login, cambio de contraseña obligatorio, registro y
 * recuperación. Controlador real + ProteccionFuerzaBrutaService real sobre
 * MongoDB en memoria; AuthService simulado (no interesa la contraseña real).
 */
jest.setTimeout(120_000);

const CORRECTA = 'Correcta123';
const MIN = 60_000;

/** Cuerpo del 429 de bloqueo temporal. */
const cuerpo = (res: { body: unknown }) =>
  res.body as { message?: string; reintentarEnSegundos?: number };

describe('Auth — bloqueo temporal por intentos fallidos (S-01)', () => {
  let mongod: MongoMemoryServer;
  let conexion: Connection;
  let intentos: Model<IntentoAuthDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    conexion = await conectarMongoPrueba(mongod.getUri('fuerza_bruta'));
    intentos = conexion.model<IntentoAuthDocument>(
      IntentoAuth.name,
      IntentoAuthSchema,
    );
    await intentos.syncIndexes();
  });

  afterAll(async () => {
    await conexion?.close();
    await mongod?.stop();
  });

  /** Correos que "ya existen" para el registro simulado. */
  const registrados = new Set(['existe@ejemplo.mx']);

  const authService = {
    login: jest.fn((dto: { email: string; password: string }) => {
      if (dto.password !== CORRECTA) {
        return Promise.reject(
          new UnauthorizedException('Credenciales incorrectas'),
        );
      }
      return Promise.resolve({
        requiresPasswordChange: false,
        requiresMfa: false,
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: '1', email: dto.email, rol: 'postulante' },
      });
    }),
    cambiarContrasenaObligatoria: jest.fn(
      (dto: { passwordTemporal: string }) =>
        dto.passwordTemporal === CORRECTA
          ? Promise.resolve()
          : Promise.reject(
              new UnauthorizedException('Contraseña temporal incorrecta'),
            ),
    ),
    registrar: jest.fn((dto: { email: string }) =>
      Promise.resolve({
        resultado:
          registrados.has(dto.email) || dto.email.startsWith('existe')
            ? 'existente'
            : 'creado',
        pendientes: Promise.resolve(),
      }),
    ),
    solicitarRecuperacion: jest.fn(() => Promise.resolve()),
  };

  async function crearApp(conThrottler = false) {
    const moduleRef = await Test.createTestingModule({
      imports: conThrottler
        ? [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])]
        : [],
      controllers: [AuthController],
      providers: [
        ProteccionFuerzaBrutaService,
        { provide: AuthService, useValue: authService },
        { provide: getModelToken(IntentoAuth.name), useValue: intentos },
        ...(conThrottler
          ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
          : []),
      ],
    }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    // Igual que main.ts: detrás del proxy de Render.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return { app, proteccion: moduleRef.get(ProteccionFuerzaBrutaService) };
  }

  let app: INestApplication<App>;
  let proteccion: ProteccionFuerzaBrutaService;

  beforeEach(async () => {
    await intentos.deleteMany({});
    jest.clearAllMocks();
    ({ app, proteccion } = await crearApp());
  });

  afterEach(async () => {
    await app?.close();
  });

  let ipSecuencial = 10;
  /** IP distinta por prueba para no mezclar contadores por IP. */
  const nuevaIp = () => `198.51.100.${ipSecuencial++}`;

  const login = (email: string, password: string, ip: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });

  describe('login: por cuenta', () => {
    it('5 contraseñas erróneas bloquean la cuenta; la 6ª da 429 aunque sea correcta', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 5; i++) {
        await login('ana@ejemplo.mx', 'Mala', ip).expect(401);
      }
      const res = await login('ana@ejemplo.mx', CORRECTA, ip).expect(429);

      expect(cuerpo(res).message).toMatch(
        /Demasiados intentos fallidos\. Espera 15 minutos/,
      );
      expect(cuerpo(res).reintentarEnSegundos).toBeGreaterThan(14 * 60);
      // Durante el bloqueo ni siquiera se verifica la contraseña.
      expect(authService.login).toHaveBeenCalledTimes(5);
    });

    it('el bloqueo sigue a la cuenta desde otra IP', async () => {
      for (let i = 0; i < 5; i++) {
        await login('beto@ejemplo.mx', 'Mala', nuevaIp()).expect(401);
      }
      await login('beto@ejemplo.mx', CORRECTA, nuevaIp()).expect(429);
    });

    it('el correo se normaliza (mayúsculas no abren otro contador)', async () => {
      const ip = nuevaIp();
      const variantes = [
        'Caro@Ejemplo.mx',
        'caro@ejemplo.mx',
        'CARO@EJEMPLO.MX',
        'caro@EJEMPLO.mx',
        'cArO@ejemplo.mx',
      ];
      for (const correo of variantes) {
        await login(correo, 'Mala', ip).expect(401);
      }
      await login('caro@ejemplo.mx', CORRECTA, ip).expect(429);
    });

    it('un acceso correcto reinicia el contador de la cuenta', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 4; i++) {
        await login('dani@ejemplo.mx', 'Mala', ip).expect(401);
      }
      await login('dani@ejemplo.mx', CORRECTA, ip).expect(200);
      for (let i = 0; i < 4; i++) {
        await login('dani@ejemplo.mx', 'Mala', ip).expect(401);
      }
      await login('dani@ejemplo.mx', CORRECTA, ip).expect(200);
    });

    it('el bloqueo es temporal: a los 15 min se puede volver a entrar', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 5; i++) {
        await login('eva@ejemplo.mx', 'Mala', ip).expect(401);
      }
      await login('eva@ejemplo.mx', CORRECTA, ip).expect(429);

      const base = Date.now();
      proteccion.ahora = () => new Date(base + 15 * MIN + 1000);
      await login('eva@ejemplo.mx', CORRECTA, ip).expect(200);
    });

    it('los fallos fuera de la ventana de 15 min no se acumulan', async () => {
      const ip = nuevaIp();
      const base = Date.now();
      for (let i = 0; i < 4; i++) {
        await login('fer@ejemplo.mx', 'Mala', ip).expect(401);
      }
      proteccion.ahora = () => new Date(base + 16 * MIN);
      // Nueva ventana: el contador vuelve a 1.
      await login('fer@ejemplo.mx', 'Mala', ip).expect(401);
      await login('fer@ejemplo.mx', CORRECTA, ip).expect(200);
    });

    it('un correo que no existe se bloquea igual (el bloqueo no revela cuentas)', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 5; i++) {
        await login('nadie@ejemplo.mx', 'Mala', ip).expect(401);
      }
      const res = await login('nadie@ejemplo.mx', 'Mala', ip).expect(429);
      expect(cuerpo(res).message).toMatch(/Demasiados intentos fallidos/);
    });
  });

  describe('login: por IP', () => {
    it('20 fallos desde una IP (cuentas distintas) bloquean la IP, no a otras', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 20; i++) {
        await login(`victima${i}@ejemplo.mx`, 'Mala', ip).expect(401);
      }
      await login('otra@ejemplo.mx', CORRECTA, ip).expect(429);
      await login('otra@ejemplo.mx', CORRECTA, nuevaIp()).expect(200);
    });

    it('falsificar el primer valor de X-Forwarded-For no evade el bloqueo', async () => {
      const ipReal = nuevaIp();
      for (let i = 0; i < 20; i++) {
        // El proxy de Render agrega la IP real al final de la cabecera.
        await login(
          `spoof${i}@ejemplo.mx`,
          'Mala',
          `10.0.0.${i}, ${ipReal}`,
        ).expect(401);
      }
      await login(
        'spoof-final@ejemplo.mx',
        CORRECTA,
        `1.2.3.4, ${ipReal}`,
      ).expect(429);
    });
  });

  describe('cambiar-contrasena-obligatoria', () => {
    const cambiar = (email: string, passwordTemporal: string, ip: string) =>
      request(app.getHttpServer())
        .post('/auth/cambiar-contrasena-obligatoria')
        .set('X-Forwarded-For', ip)
        .send({ email, passwordTemporal, nuevaPassword: 'NuevaClave123' });

    it('comparte el contador con el login (no se puede alternar endpoints)', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 3; i++) {
        await login('gabi@ejemplo.mx', 'Mala', ip).expect(401);
      }
      for (let i = 0; i < 2; i++) {
        await cambiar('gabi@ejemplo.mx', 'Mala', ip).expect(401);
      }
      await cambiar('gabi@ejemplo.mx', CORRECTA, ip).expect(429);
      await login('gabi@ejemplo.mx', CORRECTA, ip).expect(429);
      expect(authService.cambiarContrasenaObligatoria).toHaveBeenCalledTimes(2);
    });
  });

  describe('registro', () => {
    const registrar = (email: string, ip: string) =>
      request(app.getHttpServer())
        .post('/auth/registro')
        .set('X-Forwarded-For', ip)
        .send({
          email,
          nombre: 'Ana',
          apellidos: 'López',
          password: 'Contrasena123',
        });

    it('registros con correo ya registrado: misma respuesta, pero 5 desde una IP la bloquean 1 hora', async () => {
      const ip = nuevaIp();
      const nueva = await registrar('nueva0@ejemplo.mx', nuevaIp()).expect(201);
      for (let i = 0; i < 5; i++) {
        const res = await registrar(`existe${i}@ejemplo.mx`, ip).expect(201);
        // Idéntica a la de un correo nuevo: no revela que existe.
        expect(res.body).toEqual(nueva.body);
      }
      const res = await registrar('nueva@ejemplo.mx', ip).expect(429);
      expect(cuerpo(res).message).toMatch(
        /Demasiados intentos de registro\. Espera 60 minutos/,
      );
      expect(authService.registrar).toHaveBeenCalledTimes(6);

      // Otra IP no está afectada.
      await registrar('nueva2@ejemplo.mx', nuevaIp()).expect(201);
    });

    it('máximo 3 intentos por correo y hora, aunque cambie la IP; la respuesta no cambia', async () => {
      const respuestas: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await registrar('tope@ejemplo.mx', nuevaIp()).expect(201);
        respuestas.push(res.body);
      }
      expect(authService.registrar).toHaveBeenCalledTimes(3);
      expect(new Set(respuestas.map((r) => JSON.stringify(r))).size).toBe(1);
    });

    it('los registros exitosos no cuentan como fallo', async () => {
      const ip = nuevaIp();
      for (let i = 0; i < 6; i++) {
        await registrar(`nuevo${i}@ejemplo.mx`, ip).expect(201);
      }
    });
  });

  describe('recuperar-contrasena', () => {
    const recuperar = (email: string, ip: string) =>
      request(app.getHttpServer())
        .post('/auth/recuperar-contrasena')
        .set('X-Forwarded-For', ip)
        .send({ email });

    it('máximo 3 correos por destinatario y hora, aunque cambie la IP; la respuesta no cambia', async () => {
      const respuestas: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await recuperar('hugo@ejemplo.mx', nuevaIp()).expect(200);
        respuestas.push(res.body);
      }
      expect(authService.solicitarRecuperacion).toHaveBeenCalledTimes(3);
      // Mismo cuerpo dentro y fuera del tope: no revela nada.
      expect(new Set(respuestas.map((r) => JSON.stringify(r))).size).toBe(1);

      // Pasada la hora, se vuelve a enviar.
      const base = Date.now();
      proteccion.ahora = () => new Date(base + 61 * MIN);
      await recuperar('hugo@ejemplo.mx', nuevaIp()).expect(200);
      expect(authService.solicitarRecuperacion).toHaveBeenCalledTimes(4);
    });
  });

  describe('almacenamiento', () => {
    it('no guarda correos ni IPs en claro y deja fecha de expiración (TTL)', async () => {
      const ip = '203.0.113.77';
      await login('privado@ejemplo.mx', 'Mala', ip).expect(401);

      const docs = await intentos.find().lean();
      expect(docs).toHaveLength(2); // cuenta + IP
      const crudo = JSON.stringify(docs);
      expect(crudo).not.toContain('privado@ejemplo.mx');
      expect(crudo).not.toContain(ip);
      for (const d of docs) {
        expect(d.clave).toMatch(/^(cuenta|login-ip):[0-9a-f]{64}$/);
        expect(d.expiraEn).toBeInstanceOf(Date);
      }
      const indices = await intentos.collection.indexes();
      expect(indices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: { expiraEn: 1 },
            expireAfterSeconds: 0,
          }),
        ]),
      );
    });

    it('el conteo es atómico con intentos en paralelo', async () => {
      await Promise.all(
        Array.from({ length: 12 }, () =>
          proteccion.registrar(POLITICAS.cuenta, 'paralelo@ejemplo.mx'),
        ),
      );
      const doc = await intentos
        .findOne({
          clave: proteccion.clave(POLITICAS.cuenta, 'paralelo@ejemplo.mx'),
        })
        .lean();
      expect(doc?.intentos).toBe(12);
      expect(doc?.bloqueadoHasta).toBeInstanceOf(Date);
    });
  });

  describe('rate limiting por IP (@nestjs/throttler)', () => {
    it('login ya no tiene @SkipThrottle: 10 por minuto por IP', async () => {
      await app.close();
      ({ app, proteccion } = await crearApp(true));
      const ip = nuevaIp();
      for (let i = 0; i < 10; i++) {
        await login(`limite${i}@ejemplo.mx`, CORRECTA, ip).expect(200);
      }
      await login('limite-final@ejemplo.mx', CORRECTA, ip).expect(429);
      await login('limite-final@ejemplo.mx', CORRECTA, nuevaIp()).expect(200);
    });
  });
});

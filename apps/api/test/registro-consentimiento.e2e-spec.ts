/**
 * E2E del aviso de privacidad (P-01): registro con consentimiento y
 * aceptación posterior para cuentas existentes.
 *
 * HTTP real (supertest) contra AuthController, PrivacidadController y una
 * ruta de postulante cualquiera, con el mismo ValidationPipe y `trust proxy`
 * que main.ts, JWT real y MongoDB en memoria. Correo, MFA, auditoría y la
 * campanita se simulan (no son parte de lo que se prueba).
 *
 * Correr con: npm run test:e2e
 */
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import * as os from 'node:os';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { ProteccionFuerzaBrutaService } from '../src/modules/auth/proteccion-fuerza-bruta.service';
import {
  IntentoAuth,
  IntentoAuthSchema,
} from '../src/modules/auth/schemas/intento-auth.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../src/modules/auth/schemas/refresh-token.schema';
import {
  OneTimeToken,
  OneTimeTokenSchema,
} from '../src/modules/auth/schemas/one-time-token.schema';
import {
  Usuario,
  UsuarioDocument,
  UsuarioSchema,
} from '../src/modules/usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../src/modules/postulantes/schemas/postulante.schema';
import { NotificacionesService } from '../src/modules/notificaciones/notificaciones.service';
import { NotificacionesAppService } from '../src/modules/notificaciones/notificaciones-app.service';
import { MFAService } from '../src/modules/mfa/mfa.service';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service';
import { PrivacidadController } from '../src/modules/privacidad/privacidad.controller';
import { PrivacidadService } from '../src/modules/privacidad/privacidad.service';
import {
  AVISO_PRIVACIDAD_VERSION,
  CODIGO_CONSENTIMIENTO_PENDIENTE,
} from '../src/modules/privacidad/aviso-privacidad.constants';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Roles } from '../src/common/decorators/roles.decorator';
import { hashPassword } from '../src/common/utils/password.util';
import { TurnstileService } from '../src/common/turnstile/turnstile.service';

jest.setTimeout(240_000);

/** Una ruta cualquiera de postulante, protegida como las reales. */
@Controller('ruta-postulante')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('postulante')
class RutaPostulanteController {
  @Get()
  ok() {
    return { ok: true };
  }
}

const CLAVE = 'Gaviota-Norte-42';

describe('Registro con aviso de privacidad (e2e)', () => {
  let mongod: MongoMemoryServer;
  let app: INestApplication<App>;
  let usuarios: Model<UsuarioDocument>;
  const auditoria = { registrar: jest.fn(() => Promise.resolve()) };

  /** IP distinta por petición: los contadores por IP no interfieren. */
  let n = 1;
  const ip = () => `10.20.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
  const http = () => request(app.getHttpServer());

  const datosRegistro = (email: string) => ({
    email,
    nombre: 'Ana',
    apellidos: 'Prueba',
    password: CLAVE,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    const config: Record<string, string> = {
      JWT_SECRET: 'secreto-solo-para-pruebas-e2e',
      NODE_ENV: 'test',
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        // runtimeAdapters: ver test/utils/conexion-mongo-prueba.ts.
        MongooseModule.forRoot(mongod.getUri('e2e_privacidad'), {
          runtimeAdapters: { os },
        }),
        MongooseModule.forFeature([
          { name: Usuario.name, schema: UsuarioSchema },
          { name: RefreshToken.name, schema: RefreshTokenSchema },
          { name: OneTimeToken.name, schema: OneTimeTokenSchema },
          { name: Postulante.name, schema: PostulanteSchema },
          { name: IntentoAuth.name, schema: IntentoAuthSchema },
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: config.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [
        AuthController,
        PrivacidadController,
        RutaPostulanteController,
      ],
      providers: [
        AuthService,
        JwtStrategy,
        ProteccionFuerzaBrutaService,
        PrivacidadService,
        // Real, sin TURNSTILE_SECRET_KEY y con NODE_ENV=test: deja pasar.
        TurnstileService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, def?: unknown) => config[k] ?? def },
        },
        {
          provide: NotificacionesService,
          useValue: { avisosEvaluadorPorCorreo: false },
        },
        {
          provide: NotificacionesAppService,
          useValue: { notificarNuevoCandidato: jest.fn(() => null) },
        },
        { provide: MFAService, useValue: {} },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Igual que main.ts.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    usuarios = moduleRef.get(getModelToken(Usuario.name));
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  describe('POST /auth/registro', () => {
    it('sin consentimiento: 400 y no se crea la cuenta', async () => {
      const res = await http()
        .post('/auth/registro')
        .set('X-Forwarded-For', ip())
        .send(datosRegistro('sin-consentimiento@prueba.mx'))
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/aviso de privacidad/i);
      expect(
        await usuarios.countDocuments({
          email: 'sin-consentimiento@prueba.mx',
        }),
      ).toBe(0);
    });

    it('casilla sin marcar (accepted=false): 400', async () => {
      await http()
        .post('/auth/registro')
        .set('X-Forwarded-For', ip())
        .send({
          ...datosRegistro('no-acepta@prueba.mx'),
          privacyConsent: {
            accepted: false,
            version: AVISO_PRIVACIDAD_VERSION,
          },
        })
        .expect(400);
      expect(
        await usuarios.countDocuments({ email: 'no-acepta@prueba.mx' }),
      ).toBe(0);
    });

    it('versión distinta a la vigente: 400', async () => {
      const res = await http()
        .post('/auth/registro')
        .set('X-Forwarded-For', ip())
        .send({
          ...datosRegistro('version-vieja@prueba.mx'),
          privacyConsent: { accepted: true, version: '2020-01-v0' },
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/versión del aviso/i);
      expect(
        await usuarios.countDocuments({ email: 'version-vieja@prueba.mx' }),
      ).toBe(0);
    });

    it('con consentimiento vigente: 201 y guarda versión, fecha e IP', async () => {
      const antes = Date.now();
      const ipCliente = ip();
      await http()
        .post('/auth/registro')
        .set('X-Forwarded-For', ipCliente)
        .send({
          ...datosRegistro('con-consentimiento@prueba.mx'),
          privacyConsent: { accepted: true, version: AVISO_PRIVACIDAD_VERSION },
        })
        .expect(201);

      const user = await usuarios
        .findOne({ email: 'con-consentimiento@prueba.mx' })
        .lean();
      expect(user?.privacyConsent?.version).toBe(AVISO_PRIVACIDAD_VERSION);
      const fecha = user?.privacyConsent?.acceptedAt;
      expect(fecha).toBeInstanceOf(Date);
      expect(fecha!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
      expect(fecha!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      // req.ip con trust proxy = 1: la IP que puso el proxy de Render.
      expect(user?.privacyConsent?.ip).toBe(ipCliente);
      // El campo "accepted" no se guarda: solo versión, fecha e IP.
      expect(user?.privacyConsent).not.toHaveProperty('accepted');

      // Y puede entrar sin que se le pida aceptar de nuevo.
      const login = await http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip())
        .send({ email: 'con-consentimiento@prueba.mx', password: CLAVE })
        .expect(200);
      expect(
        (login.body as { requiresPrivacyConsent: boolean })
          .requiresPrivacyConsent,
      ).toBe(false);
    });
  });

  describe('cuenta existente sin consentimiento', () => {
    const email = 'antiguo@prueba.mx';

    beforeAll(async () => {
      // Como las cuentas creadas antes de este cambio: sin privacyConsent.
      await usuarios.create({
        email,
        passwordHash: await hashPassword(CLAVE),
        nombre: 'Antiguo',
        apellidos: 'Postulante',
        rol: 'postulante',
        estadoCuenta: 'activa',
      });
    });

    it('el login avisa que falta aceptar, la API bloquea y tras aceptar se libera', async () => {
      const login = await http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip())
        .send({ email, password: CLAVE })
        .expect(200);
      const body = login.body as {
        accessToken: string;
        requiresPrivacyConsent: boolean;
      };
      expect(body.requiresPrivacyConsent).toBe(true);
      const auth = { Authorization: `Bearer ${body.accessToken}` };

      const bloqueada = await http()
        .get('/ruta-postulante')
        .set(auth)
        .expect(403);
      expect((bloqueada.body as { codigo?: string }).codigo).toBe(
        CODIGO_CONSENTIMIENTO_PENDIENTE,
      );

      // Versión equivocada: 400 y no se guarda nada.
      await http()
        .post('/privacidad/consentimiento')
        .set(auth)
        .send({ version: 'otra' })
        .expect(400);
      expect(
        (await usuarios.findOne({ email }).lean())?.privacyConsent,
      ).toBeUndefined();

      await http()
        .post('/privacidad/consentimiento')
        .set(auth)
        .set('X-Forwarded-For', '10.99.0.7')
        .send({ version: AVISO_PRIVACIDAD_VERSION })
        .expect(200);

      const user = await usuarios.findOne({ email }).lean();
      expect(user?.privacyConsent?.version).toBe(AVISO_PRIVACIDAD_VERSION);
      expect(user?.privacyConsent?.acceptedAt).toBeInstanceOf(Date);
      expect(user?.privacyConsent?.ip).toBe('10.99.0.7');
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'privacidad.consentimiento_aceptado',
        }),
      );

      // El mismo access token ya sirve: el estado se lee de la BD.
      await http().get('/ruta-postulante').set(auth).expect(200);
    });

    it('sin token, el endpoint de aceptación responde 401', async () => {
      await http()
        .post('/privacidad/consentimiento')
        .send({ version: AVISO_PRIVACIDAD_VERSION })
        .expect(401);
    });
  });

  it('evaluadores y administradores no quedan bloqueados', async () => {
    await usuarios.create({
      email: 'evaluador@prueba.mx',
      passwordHash: await hashPassword(CLAVE),
      nombre: 'Eva',
      apellidos: 'Luadora',
      rol: 'evaluador',
      estadoCuenta: 'activa',
    });
    const login = await http()
      .post('/auth/login')
      .set('X-Forwarded-For', ip())
      .send({ email: 'evaluador@prueba.mx', password: CLAVE })
      .expect(200);
    expect(
      (login.body as { requiresPrivacyConsent: boolean })
        .requiresPrivacyConsent,
    ).toBe(false);
  });
});

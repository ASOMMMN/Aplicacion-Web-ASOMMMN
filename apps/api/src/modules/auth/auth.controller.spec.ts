import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * Logout y refresh por HTTP, con las opciones de cookie de producción
 * (SameSite=None; Secure) y un almacén de refresh tokens en memoria.
 */

interface TokenGuardado {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Cada operación cede el turno antes de actuar, como una consulta real: con
 * findOne + deleteOne, dos refresh simultáneos leerían el mismo token.
 */
function almacenTokens() {
  const tokens: TokenGuardado[] = [];
  const turno = () => new Promise((r) => setImmediate(r));
  const vigente = (q: { tokenHash: string }) => (t: TokenGuardado) =>
    t.tokenHash === q.tokenHash && t.expiresAt > new Date();
  return {
    tokens,
    model: {
      async create(doc: Omit<TokenGuardado, '_id'>) {
        await turno();
        tokens.push({ _id: new Types.ObjectId(), ...doc });
      },
      async findOne(q: { tokenHash: string }) {
        await turno();
        return tokens.find(vigente(q)) ?? null;
      },
      async findOneAndDelete(q: { tokenHash: string }) {
        await turno();
        const i = tokens.findIndex(vigente(q));
        return i < 0 ? null : tokens.splice(i, 1)[0];
      },
      async deleteOne(q: { _id?: Types.ObjectId; tokenHash?: string }) {
        await turno();
        const i = tokens.findIndex(
          (t) => (q._id && t._id.equals(q._id)) || t.tokenHash === q.tokenHash,
        );
        if (i >= 0) tokens.splice(i, 1);
      },
    },
  };
}

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const COOKIE = 'refresh_token';

describe('AuthController: logout y refresh (cookies de producción)', () => {
  let app: INestApplication<App>;
  let almacen: ReturnType<typeof almacenTokens>;
  const userId = new Types.ObjectId();
  const nodeEnvAnterior = process.env.NODE_ENV;

  const sembrar = (raw: string) =>
    almacen.tokens.push({
      _id: new Types.ObjectId(),
      userId,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 60_000),
    });

  beforeAll(async () => {
    // Las opciones de cookie se calculan al cargar el controlador.
    process.env.NODE_ENV = 'production';
    const { AuthController } = await import('./auth.controller');
    const { AuthService } = await import('./auth.service');
    const { Usuario } = await import('../usuarios/schemas/usuario.schema');
    const { RefreshToken } = await import('./schemas/refresh-token.schema');
    const { OneTimeToken } = await import('./schemas/one-time-token.schema');
    const { NotificacionesService } =
      await import('../notificaciones/notificaciones.service');
    const { MFAService } = await import('../mfa/mfa.service');
    const { AuditoriaService } = await import('../auditoria/auditoria.service');

    almacen = almacenTokens();
    const usuario = {
      _id: userId,
      email: 'evaluador@ejemplo.mx',
      rol: 'evaluador',
      estadoCuenta: 'activa',
    };

    const moduleRef = await Test.createTestingModule({
      // Límite global bajo: el logout no debe contar contra él.
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: getModelToken(RefreshToken.name), useValue: almacen.model },
        {
          provide: getModelToken(Usuario.name),
          useValue: {
            findById: () => Promise.resolve(usuario),
            updateMany: () => Promise.resolve({ modifiedCount: 0 }),
          },
        },
        { provide: getModelToken(OneTimeToken.name), useValue: {} },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: 'secreto-de-prueba',
            signOptions: { expiresIn: '15m' },
          }),
        },
        {
          provide: ConfigService,
          useValue: { get: (_k: string, d?: unknown) => d },
        },
        { provide: NotificacionesService, useValue: {} },
        { provide: MFAService, useValue: {} },
        {
          provide: AuditoriaService,
          useValue: { registrar: () => Promise.resolve() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = nodeEnvAnterior;
  });

  beforeEach(() => {
    almacen.tokens.length = 0;
  });

  const cookieBorrada = (res: request.Response) => {
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return setCookie.find((c) => c.startsWith(`${COOKIE}=;`));
  };

  it('logout sin access token ni cookie: 200 y borra la cookie con SameSite=None; Secure', async () => {
    const res = await request(app.getHttpServer()).post('/auth/logout');
    expect(res.status).toBe(200);
    const c = cookieBorrada(res);
    expect(c).toBeDefined();
    expect(c).toMatch(/SameSite=None/i);
    expect(c).toMatch(/Secure/i);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Path=\//);
    expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('logout sin access token pero con cookie: revoca el refresh token', async () => {
    sembrar('token-a');
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `${COOKIE}=token-a`);
    expect(res.status).toBe(200);
    expect(almacen.tokens).toHaveLength(0);
    expect(cookieBorrada(res)).toMatch(/SameSite=None/i);
  });

  it('logout no cuenta contra el límite de peticiones', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(200);
    }
  });

  it('un segundo refresh con la misma cookie responde 401', async () => {
    sembrar('token-b');
    const primero = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${COOKIE}=token-b`);
    expect(primero.status).toBe(200);
    expect((primero.body as { accessToken?: unknown }).accessToken).toEqual(
      expect.any(String),
    );
    const nueva = ([] as string[])
      .concat(primero.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith(`${COOKIE}=`));
    expect(nueva).toMatch(/SameSite=None/i);

    const segundo = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${COOKIE}=token-b`);
    expect(segundo.status).toBe(401);
  });

  it('dos refresh simultáneos con la misma cookie: solo uno gana', async () => {
    sembrar('token-c');
    const [a, b] = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', `${COOKIE}=token-c`),
      ),
    );
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    // Queda solo el token emitido por el que ganó.
    expect(almacen.tokens).toHaveLength(1);
  });
});

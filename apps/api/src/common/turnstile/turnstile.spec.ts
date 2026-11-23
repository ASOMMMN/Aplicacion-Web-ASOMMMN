import {
  Body,
  Controller,
  INestApplication,
  Logger,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Express } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AuthController } from '../../modules/auth/auth.controller';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { MENSAJE_TURNSTILE, TurnstileGuard } from './turnstile.guard';
import {
  TIMEOUT_SITEVERIFY_MS,
  TurnstileService,
  URL_SITEVERIFY,
} from './turnstile.service';

/** Ruta mínima protegida igual que /auth/login (mismo DTO y ValidationPipe). */
@Controller()
class RutaProtegida {
  @Post('protegida')
  @UseGuards(TurnstileGuard)
  ok(@Body() dto: LoginDto) {
    return { ok: true, email: dto.email };
  }
}

const CUERPO = { email: 'ana@prueba.mx', password: 'x' };

describe('TurnstileGuard / TurnstileService', () => {
  let app: INestApplication<App>;
  let servicio: TurnstileService;
  let fetchFn: jest.Mock<Promise<Response>, [string, RequestInit]>;
  let logError: jest.SpyInstance;

  async function crear(secreto: string, nodeEnv = 'development') {
    const ref = await Test.createTestingModule({
      controllers: [RutaProtegida],
      providers: [
        TurnstileService,
        TurnstileGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              ({ TURNSTILE_SECRET_KEY: secreto, NODE_ENV: nodeEnv })[k],
          },
        },
      ],
    }).compile();
    app = ref.createNestApplication();
    // Igual que main.ts: la IP real la pone el proxy de Render.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    servicio = app.get(TurnstileService);
    fetchFn = jest.fn<Promise<Response>, [string, RequestInit]>();
    servicio.fetchFn = fetchFn;
    await app.init();
  }

  const responder = (datos: unknown, status = 200) =>
    fetchFn.mockResolvedValue(new Response(JSON.stringify(datos), { status }));

  const enviar = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/protegida')
      .set('X-Forwarded-For', '203.0.113.9')
      .send(body);

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  describe('con TURNSTILE_SECRET_KEY', () => {
    beforeEach(() => crear('secreto-prueba', 'production'));

    it('token válido: pasa y se verifica con el secreto y la IP del cliente', async () => {
      responder({ success: true });
      await enviar({ ...CUERPO, turnstileToken: 'token-del-widget' }).expect(
        201,
      );

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe(URL_SITEVERIFY);
      expect(init.method).toBe('POST');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const cuerpo = init.body as URLSearchParams;
      expect(cuerpo.get('secret')).toBe('secreto-prueba');
      expect(cuerpo.get('response')).toBe('token-del-widget');
      expect(cuerpo.get('remoteip')).toBe('203.0.113.9');
    });

    it('token inválido (Cloudflare responde success=false): 400 genérico', async () => {
      responder({ success: false, 'error-codes': ['invalid-input-response'] });
      const res = await enviar({ ...CUERPO, turnstileToken: 'falso' }).expect(
        400,
      );
      expect((res.body as { message: string }).message).toBe(MENSAJE_TURNSTILE);
    });

    it('token ausente: 400 genérico sin llamar a Cloudflare', async () => {
      const res = await enviar(CUERPO).expect(400);
      expect((res.body as { message: string }).message).toBe(MENSAJE_TURNSTILE);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('token vacío, demasiado largo o que no es texto: 400 sin llamar a Cloudflare', async () => {
      for (const turnstileToken of ['', 'x'.repeat(2049), 12345, ['a']]) {
        await enviar({ ...CUERPO, turnstileToken }).expect(400);
      }
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('Cloudflare caído (error de red): falla cerrado con 400', async () => {
      fetchFn.mockRejectedValue(new TypeError('fetch failed'));
      const res = await enviar({ ...CUERPO, turnstileToken: 'token' }).expect(
        400,
      );
      expect((res.body as { message: string }).message).toBe(MENSAJE_TURNSTILE);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('no se pudo verificar'),
      );
    });

    it('Cloudflare no responde a tiempo: se aborta y falla cerrado', async () => {
      fetchFn.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('timeout', 'TimeoutError')),
            );
          }),
      );
      expect(servicio.timeoutMs).toBe(TIMEOUT_SITEVERIFY_MS);
      servicio.timeoutMs = 50;
      const inicio = Date.now();
      await expect(servicio.verificar('token', '203.0.113.9')).resolves.toBe(
        false,
      );
      expect(Date.now() - inicio).toBeLessThan(2_000);
    });

    it('Cloudflare responde 5xx o algo que no es JSON: falla cerrado', async () => {
      responder({ success: true }, 503);
      await enviar({ ...CUERPO, turnstileToken: 'token' }).expect(400);

      fetchFn.mockResolvedValue(new Response('<html>error</html>'));
      await enviar({ ...CUERPO, turnstileToken: 'token' }).expect(400);
    });
  });

  describe('sin TURNSTILE_SECRET_KEY', () => {
    it('fuera de producción deja pasar (desarrollo local sin captcha)', async () => {
      await crear('', 'development');
      await enviar(CUERPO).expect(201);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('en producción falla cerrado y lo avisa al arrancar', async () => {
      await crear('', 'production');
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('TURNSTILE_SECRET_KEY no está definida'),
      );
      await enviar({ ...CUERPO, turnstileToken: 'token' }).expect(400);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('rutas protegidas en AuthController', () => {
    const guardsDe = (metodo: keyof AuthController): unknown[] => {
      const handler = Object.getOwnPropertyDescriptor(
        AuthController.prototype,
        metodo,
      )?.value as object;
      return (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];
    };

    it.each(['registro', 'login', 'recuperarContrasena'] as const)(
      '%s exige Turnstile',
      (metodo) => {
        expect(guardsDe(metodo)).toContain(TurnstileGuard);
      },
    );

    it.each([
      'refresh',
      'logout',
      'logoutAll',
      'restablecerContrasena',
      'verificarMfaLogin',
    ] as const)('%s no exige Turnstile', (metodo) => {
      expect(guardsDe(metodo)).not.toContain(TurnstileGuard);
    });
  });
});

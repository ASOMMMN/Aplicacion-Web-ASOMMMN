import {
  CanActivate,
  Controller,
  Get,
  INestApplication,
  Injectable,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import {
  MENSAJE_RUTA_NO_DECLARADA,
  RutasCerradasGuard,
} from './rutas-cerradas.guard';

/** Sustituto de JwtAuthGuard: "autentica" siempre como administrador. */
@Injectable()
class JwtFalso implements CanActivate {
  canActivate(ctx: import('@nestjs/common').ExecutionContext) {
    ctx.switchToHttp().getRequest<{ user?: unknown }>().user = {
      userId: '1',
      rol: 'administrador',
    };
    return true;
  }
}

@Controller('prueba')
class RutasDePrueba {
  @Get('sin-nada')
  sinNada() {
    return { ok: true };
  }

  @Get('sin-nada-2')
  sinNada2() {
    return { ok: true };
  }

  @Get('solo-jwt')
  @UseGuards(JwtAuthGuard)
  soloJwt() {
    return { ok: true };
  }

  @Get('jwt-y-roles-guard-sin-roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  sinRoles() {
    return { ok: true };
  }

  @Get('otro-guard')
  @UseGuards(JwtFalso)
  @Roles('administrador')
  otroGuard() {
    return { ok: true };
  }

  @Get('completa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrador')
  completa() {
    return { ok: true };
  }

  @Get('publica')
  @Public()
  publica() {
    return { ok: true };
  }
}

@Public()
@Controller('controlador-publico')
class ControladorPublico {
  @Get()
  hola() {
    return { ok: true };
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
@Controller('declarado-en-clase')
class DeclaradoEnClase {
  @Get()
  hola() {
    return { ok: true };
  }
}

describe('RutasCerradasGuard (rutas cerradas por defecto)', () => {
  let app: INestApplication<App>;
  let logError: jest.SpyInstance;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      controllers: [RutasDePrueba, ControladorPublico, DeclaradoEnClase],
      providers: [{ provide: APP_GUARD, useClass: RutasCerradasGuard }],
    })
      // JwtAuthGuard real necesita Passport; aquí basta con que "autentique".
      .overrideGuard(JwtAuthGuard)
      .useClass(JwtFalso)
      .compile();
    app = ref.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => logError.mockRestore());
  afterAll(() => app.close());

  const get = (ruta: string) => request(app.getHttpServer()).get(ruta);

  it.each([
    ['sin ningún guard ni @Public()', '/prueba/sin-nada'],
    ['solo JwtAuthGuard (sin RolesGuard ni @Roles)', '/prueba/solo-jwt'],
    [
      'JwtAuthGuard + RolesGuard sin @Roles',
      '/prueba/jwt-y-roles-guard-sin-roles',
    ],
    ['otro guard que no es JwtAuthGuard', '/prueba/otro-guard'],
  ])('cierra la ruta %s con 403', async (_caso, ruta) => {
    const res = await get(ruta).expect(403);
    expect((res.body as { message: string }).message).toBe(
      MENSAJE_RUTA_NO_DECLARADA,
    );
  });

  it('avisa en el log una sola vez por ruta, sin datos de la petición', async () => {
    await get('/prueba/sin-nada-2').expect(403);
    await get('/prueba/sin-nada-2').expect(403);
    const avisos = (logError.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .filter((m) => m.includes('RutasDePrueba.sinNada2'));
    expect(avisos).toHaveLength(1);
  });

  it.each([
    ['JwtAuthGuard + RolesGuard + @Roles en el método', '/prueba/completa'],
    ['JwtAuthGuard + RolesGuard + @Roles en la clase', '/declarado-en-clase'],
    ['@Public() en el método', '/prueba/publica'],
    ['@Public() en la clase', '/controlador-publico'],
  ])('deja pasar %s', async (_caso, ruta) => {
    await get(ruta).expect(200);
  });
});

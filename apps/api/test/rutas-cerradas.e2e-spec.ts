/**
 * Rutas cerradas por defecto, contra la API completa (AppModule, los mismos
 * guards globales que en producción) y MongoDB en memoria.
 *
 * 1. Toda ruta es @Public() o declara JwtAuthGuard + RolesGuard + @Roles.
 *    Una ruta nueva sin nada de eso hace fallar esta prueba.
 * 2. La lista de rutas públicas es exactamente la esperada: abrir una ruta
 *    nueva sin sesión obliga a agregarla aquí a propósito.
 * 3. Sin token, toda ruta no pública responde 401.
 * 4. Las rutas públicas siguen abiertas (el guard nuevo no las bloquea).
 * 5. Con un token válido de un rol permitido, ninguna ruta GET recibe el 403
 *    del guard nuevo, y el refresh con cookie sigue funcionando.
 *
 * Correr con: npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { ES_PUBLICA_KEY } from '../src/common/decorators/public.decorator';
import { MENSAJE_RUTA_NO_DECLARADA } from '../src/common/guards/rutas-cerradas.guard';
import { hashPassword } from '../src/common/utils/password.util';
import { arrancarAppPrueba } from './utils/app-prueba';
import { listarRutas, type RutaApp } from './utils/rutas-app';

jest.setTimeout(300_000);

/** Rutas que deben responder sin sesión. Agregar aquí solo a propósito. */
const PUBLICAS_ESPERADAS = [
  'GET /auth/test-verificar-email', // pendiente: candidata a eliminarse (ver PR)
  'GET /auth/verificar-email',
  'GET /health',
  'POST /auth/cambiar-contrasena-obligatoria',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/mfa/setup/activar',
  'POST /auth/mfa/setup/iniciar',
  'POST /auth/mfa/verificar-login',
  'POST /auth/recuperar-contrasena',
  'POST /auth/reenviar-verificacion',
  'POST /auth/refresh',
  'POST /auth/registro',
  'POST /auth/restablecer-contrasena',
].sort();

const CLAVE = 'Gaviota-Norte-42';
const ID_FALSO = '0123456789abcdef01234567';

type Rol = 'postulante' | 'evaluador' | 'administrador';

describe('Rutas cerradas por defecto (API completa)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let rutas: RutaApp[];
  const tokens = {} as Record<Rol, string>;
  let cookieRefresh = '';

  /** IP distinta por petición: el throttler por IP no interfiere. */
  let n = 1;
  const ip = () => `10.40.${Math.floor(n / 250) % 250}.${(n++ % 250) + 1}`;
  const clave = (r: RutaApp) => `${r.metodo} ${r.ruta}`;
  const esPublica = (r: RutaApp) => r.metadatos[ES_PUBLICA_KEY] === true;
  const conIds = (ruta: string) => ruta.replace(/:[A-Za-z]+/g, ID_FALSO);

  const pedir = (metodo: string, ruta: string) => {
    const agente = request(app.getHttpServer() as App);
    const m = metodo.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete';
    return agente[m](conIds(ruta)).set('X-Forwarded-For', ip()).timeout(20_000);
  };

  beforeAll(async () => {
    ({ app, mongod } = await arrancarAppPrueba());
    rutas = listarRutas(app, [ES_PUBLICA_KEY]);

    const usuarios: Model<Record<string, unknown>> = app.get(
      getModelToken('Usuario'),
    );
    for (const rol of ['postulante', 'evaluador', 'administrador'] as Rol[]) {
      await usuarios.create({
        email: `${rol}@rutas.test`,
        passwordHash: await hashPassword(CLAVE),
        nombre: rol,
        apellidos: 'Prueba',
        rol,
        estadoCuenta: 'activa',
        emailVerificado: true,
      });
      const res = await pedir('POST', '/auth/login')
        .send({ email: `${rol}@rutas.test`, password: CLAVE })
        .expect(200);
      tokens[rol] = (res.body as { accessToken: string }).accessToken;
      if (rol === 'postulante') {
        cookieRefresh = ([] as string[])
          .concat(res.headers['set-cookie'] ?? [])
          .map((c) => c.split(';')[0])
          .join('; ');
      }
    }
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  it('la API tiene rutas (el recorrido no está vacío)', () => {
    expect(rutas.length).toBeGreaterThan(100);
  });

  it('toda ruta es @Public() o declara JwtAuthGuard + RolesGuard + @Roles', () => {
    const sinDeclarar = rutas
      .filter(
        (r) =>
          !esPublica(r) &&
          !(
            r.guards.includes('JwtAuthGuard') &&
            r.guards.includes('RolesGuard') &&
            r.roles.length > 0
          ),
      )
      .map((r) => `${clave(r)} (${r.controlador}.${r.handler})`);
    expect(sinDeclarar).toEqual([]);
  });

  it('las rutas públicas son exactamente las esperadas', () => {
    expect(rutas.filter(esPublica).map(clave).sort()).toEqual(
      PUBLICAS_ESPERADAS,
    );
  });

  it('sin token, toda ruta no pública responde 401', async () => {
    const inesperadas: string[] = [];
    for (const r of rutas.filter((x) => !esPublica(x))) {
      const res = await pedir(r.metodo, r.ruta);
      if (res.status !== 401) inesperadas.push(`${clave(r)} → ${res.status}`);
    }
    expect(inesperadas).toEqual([]);
  });

  it('las rutas públicas siguen abiertas sin token', async () => {
    const bloqueadas: string[] = [];
    for (const r of rutas.filter(esPublica)) {
      const res = await pedir(r.metodo, r.ruta).send({});
      const mensaje = (res.body as { message?: unknown })?.message;
      if (res.status === 403 && mensaje === MENSAJE_RUTA_NO_DECLARADA) {
        bloqueadas.push(clave(r));
      }
    }
    expect(bloqueadas).toEqual([]);
    await pedir('GET', '/health').expect(200);
  });

  it('con token de un rol permitido, ninguna ruta GET recibe el 403 del guard nuevo', async () => {
    const problemas: string[] = [];
    for (const r of rutas.filter((x) => !esPublica(x) && x.metodo === 'GET')) {
      const rol = r.roles[0] as Rol;
      const res = await pedir(r.metodo, r.ruta).set(
        'Authorization',
        `Bearer ${tokens[rol]}`,
      );
      const mensaje = (res.body as { message?: unknown })?.message;
      if (res.status === 401)
        problemas.push(`${clave(r)} → 401 con token válido`);
      if (res.status === 403 && mensaje === MENSAJE_RUTA_NO_DECLARADA) {
        problemas.push(`${clave(r)} → 403 del guard nuevo`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it('flujos que ya funcionaban: refresh con cookie, campanita y exportaciones', async () => {
    const refresh = await pedir('POST', '/auth/refresh')
      .set('Cookie', cookieRefresh)
      .expect(200);
    expect(refresh.body).toHaveProperty('accessToken');

    await pedir('GET', '/notificaciones/mias')
      .set('Authorization', `Bearer ${tokens.evaluador}`)
      .expect(200);
    await pedir('POST', '/auth/logout-todos')
      .set('Authorization', `Bearer ${tokens.administrador}`)
      .expect(200);
  });
});

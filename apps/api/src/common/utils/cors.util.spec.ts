import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ORIGENES_CORS_DESARROLLO,
  opcionesCors,
  parsearOrigenesCors,
} from './cors.util';

describe('parsearOrigenesCors', () => {
  it('acepta un origen', () => {
    expect(parsearOrigenesCors('https://app.ejemplo.test')).toEqual([
      'https://app.ejemplo.test',
    ]);
  });

  it('acepta varios separados por comas, con espacios, puerto y sin repetidos', () => {
    expect(
      parsearOrigenesCors(
        ' https://app.ejemplo.test , https://staging--app.ejemplo.test:8443,https://app.ejemplo.test ',
      ),
    ).toEqual([
      'https://app.ejemplo.test',
      'https://staging--app.ejemplo.test:8443',
    ]);
  });

  it.each([undefined, '', '   '])(
    'rechaza %p con un mensaje claro',
    (valor) => {
      expect(() => parsearOrigenesCors(valor)).toThrow(
        /CORS_ORIGIN no está definida/,
      );
    },
  );

  it.each([
    ['*', /comodines/],
    ['https://*.ejemplo.test', /comodines/],
    ['https://app.ejemplo.test,*', /comodines/],
    ['http://app.ejemplo.test', /https/],
    ['app.ejemplo.test', /URL válida|https/],
    [
      'https://app.ejemplo.test/',
      /exactamente un origen.*"https:\/\/app\.ejemplo\.test"/,
    ],
    ['https://app.ejemplo.test/ruta', /exactamente un origen/],
    ['https://app.ejemplo.test?x=1', /exactamente un origen/],
    ['https://usuario:clave@app.ejemplo.test', /exactamente un origen/],
    ['https://APP.ejemplo.test', /exactamente un origen/],
    ['https://app.ejemplo.test:443', /exactamente un origen/],
    ['https://a.ejemplo.test,,https://b.ejemplo.test', /elemento vacío/],
    ['https://a.ejemplo.test,', /elemento vacío/],
  ])('rechaza %p', (valor, mensaje) => {
    expect(() => parsearOrigenesCors(valor)).toThrow(mensaje);
  });

  it('indica qué elemento de la lista es inválido', () => {
    expect(() =>
      parsearOrigenesCors('https://a.ejemplo.test,http://b.ejemplo.test'),
    ).toThrow(/elemento 2/);
  });

  it('los orígenes de desarrollo son solo localhost', () => {
    expect(
      ORIGENES_CORS_DESARROLLO.every((o) => o.startsWith('http://localhost:')),
    ).toBe(true);
  });
});

@Controller('prueba')
class ControladorPrueba {
  @Get()
  ok() {
    return { ok: true };
  }
}

describe('CORS por HTTP (preflight y petición real)', () => {
  let app: INestApplication;
  const PERMITIDO = 'https://staging--app.ejemplo.test';
  const OTRO_PERMITIDO = 'https://app.ejemplo.test';
  const NO_PERMITIDO = 'https://intruso.ejemplo.test';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [ControladorPrueba],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.enableCors(opcionesCors([PERMITIDO, OTRO_PERMITIDO]));
    await app.init();
  });
  afterAll(() => app.close());

  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);

  it.each([PERMITIDO, OTRO_PERMITIDO])(
    'preflight desde %s: permitido con credenciales',
    async (origen) => {
      const res = await http()
        .options('/prueba')
        .set('Origin', origen)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origen);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('DELETE');
      expect(res.headers['vary']).toContain('Origin');
    },
  );

  it('preflight desde un origen no permitido: sin cabecera Allow-Origin', async () => {
    const res = await http()
      .options('/prueba')
      .set('Origin', NO_PERMITIDO)
      .set('Access-Control-Request-Method', 'GET');
    // Sin Allow-Origin el navegador bloquea la respuesta (la librería cors
    // emite Allow-Credentials igualmente; no tiene efecto sin Allow-Origin).
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('petición real: origen permitido recibe su propio origen, no uno cualquiera', async () => {
    const res = await http().get('/prueba').set('Origin', PERMITIDO);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PERMITIDO);
  });

  it('petición real: origen no permitido no recibe Allow-Origin', async () => {
    const res = await http().get('/prueba').set('Origin', NO_PERMITIDO);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('un subdominio parecido no cuenta como permitido (coincidencia exacta)', async () => {
    const res = await http()
      .get('/prueba')
      .set('Origin', 'https://staging--app.ejemplo.test.intruso.test');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

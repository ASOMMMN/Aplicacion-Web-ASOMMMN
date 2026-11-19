import 'reflect-metadata'; // class-validator lo necesita fuera de Nest
import { validate } from './env.validation';

// Variables obligatorias de env.validation.ts, con valores ficticios.
const BASE = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/prueba',
  JWT_SECRET: 'secreto-de-prueba',
  CLOUDINARY_CLOUD_NAME: 'ficticio',
  CLOUDINARY_API_KEY: 'ficticio',
  CLOUDINARY_API_SECRET: 'ficticio',
  AWS_ACCESS_KEY_ID: 'ficticio',
  AWS_SECRET_ACCESS_KEY: 'ficticio',
  AWS_S3_BUCKET: 'bucket-ficticio',
};

describe('validate() — CORS_ORIGIN', () => {
  it('producción sin CORS_ORIGIN: no arranca, con un mensaje claro', () => {
    expect(() => validate({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGIN no está definida/,
    );
  });

  it.each([
    'https://app.ejemplo.test/',
    'https://*.ejemplo.test',
    'http://app.ejemplo.test',
  ])('producción con CORS_ORIGIN inválida (%s): no arranca', (valor) => {
    expect(() =>
      validate({ ...BASE, NODE_ENV: 'production', CORS_ORIGIN: valor }),
    ).toThrow(/CORS_ORIGIN inválida/);
  });

  it('producción con una lista válida: arranca', () => {
    expect(() =>
      validate({
        ...BASE,
        NODE_ENV: 'production',
        CORS_ORIGIN:
          'https://app.ejemplo.test,https://staging--app.ejemplo.test',
      }),
    ).not.toThrow();
  });

  it.each(['*@ejemplo.test', 'no es correo', 'a@ejemplo.test,'])(
    'EMAIL_ALLOWLIST inválida (%s): no arranca, en cualquier entorno',
    (valor) => {
      expect(() =>
        validate({ ...BASE, NODE_ENV: 'test', EMAIL_ALLOWLIST: valor }),
      ).toThrow(/EMAIL_ALLOWLIST inválida/);
    },
  );

  it('EMAIL_ALLOWLIST válida: arranca', () => {
    expect(() =>
      validate({
        ...BASE,
        NODE_ENV: 'test',
        EMAIL_ALLOWLIST: 'ana@ejemplo.test,equipo.test',
      }),
    ).not.toThrow();
  });

  it.each(['development', 'test'])(
    '%s: CORS_ORIGIN no es obligatoria',
    (env) => {
      expect(() => validate({ ...BASE, NODE_ENV: env })).not.toThrow();
    },
  );
});

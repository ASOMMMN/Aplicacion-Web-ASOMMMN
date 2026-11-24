import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Arranca la API completa (AppModule, los mismos módulos y guards globales
 * que en producción) contra MongoDB en memoria, con variables de entorno de
 * prueba y sin red: S3, correo e IA quedan sin credenciales reales.
 */
export async function arrancarAppPrueba(): Promise<{
  app: INestApplication;
  mongod: MongoMemoryServer;
}> {
  const mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: 60_000 },
  });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongod.getUri('rutas_e2e'),
    JWT_SECRET: 'secreto-e2e-solo-para-pruebas-0123456789',
    JWT_REFRESH_SECRET: 'secreto-e2e-refresh-solo-para-pruebas',
    JWT_EXPIRES_IN: '15m',
    CLOUDINARY_CLOUD_NAME: 'prueba',
    CLOUDINARY_API_KEY: 'prueba',
    CLOUDINARY_API_SECRET: 'prueba',
    AWS_ACCESS_KEY_ID: 'prueba',
    AWS_SECRET_ACCESS_KEY: 'prueba',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: 'bucket-prueba',
    OPENAI_API_KEY: '',
    RESEND_API_KEY: '',
    ADMIN_EMAIL: '',
  });

  // Importar después de definir el entorno (ConfigModule lo valida al cargar).
  const { AppModule } = await import('../../src/app.module');
  const ref = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = ref.createNestApplication({ logger: false });
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
  return { app, mongod };
}

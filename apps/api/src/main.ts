// Debe ser el PRIMER import: escribe la primera línea de arranque antes de
// cargar Nest y el resto del código (ver common/arranque/).
import './common/arranque/inicio-arranque';
import { detenerVigilante, fase } from './common/arranque/fases-arranque';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  Logger,
  ValidationPipe,
  type LoggerService as NestLoggerService,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerService } from './common/logger';
import {
  ORIGENES_CORS_DESARROLLO,
  opcionesCors,
  parsearOrigenesCors,
} from './common/utils/cors.util';
import { sincronizarIndicesEnSegundoPlano } from './common/arranque/indices-segundo-plano';

async function bootstrap() {
  fase('nest', 'código cargado; creando la aplicación (NestFactory.create)');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  fase('nest', 'aplicación creada; configurando middlewares');

  // Render corre la app detrás de un proxy inverso: sin esto, Express ve
  // todas las peticiones como si vinieran de la IP interna del proxy, y el
  // rate limiting de @nestjs/throttler (que usa req.ip) termina compartiendo
  // el mismo cupo entre todos los usuarios en vez de contarlos por IP real.
  (app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', 1);

  const winstonLogger = app.get<NestLoggerService>(
    WINSTON_MODULE_NEST_PROVIDER,
  );
  app.useLogger(winstonLogger);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const isProduction = config.get('NODE_ENV') === 'production';

  // Sin key, la extracción de fechas, el análisis de CV, los cursos y el
  // chatbot quedan sin IA: avisarlo al arrancar, no al primer documento.
  if (!config.get<string>('OPENAI_API_KEY', '').trim()) {
    new Logger('Configuracion').error(
      'OPENAI_API_KEY no está configurada: la extracción de fechas de documentos personales, ' +
        'el análisis de CV, la extracción de cursos y el chatbot NO funcionarán. ' +
        'Defínela en las variables de entorno del servicio (Render → Environment).',
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      hsts: {
        maxAge: 63_072_000,
        includeSubDomains: true,
        preload: true,
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  const uploadsDir =
    config.get<string>('STORAGE_PATH') || join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  // CORS: en producción, CORS_ORIGIN (Render) es una lista de orígenes exactos
  // separados por comas (sin comodines); si falta o es inválida la API no
  // arranca (ver parsearOrigenesCors; env.validation ya lo comprueba antes de
  // conectar a Mongo). No hay valor por defecto. En desarrollo se permite
  // localhost para no bloquear el frontend local.
  const origenesCors = isProduction
    ? parsearOrigenesCors(config.get<string>('CORS_ORIGIN'))
    : ORIGENES_CORS_DESARROLLO;

  app.enableCors(opcionesCors(origenesCors));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ASOMMMN API')
      .setDescription('API REST del sistema de evaluación curricular')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
  }
 
  fase('init', 'inicializando módulos (onModuleInit / onApplicationBootstrap)');
  await app.init();
  await app.listen(port);
  fase('escuchando', `puerto ${port} abierto`);
  detenerVigilante();

  // autoIndex está apagado en producción (ver config/mongoose.config.ts):
  // los índices se crean ahora, con el puerto ya abierto y sin esperar.
  if (isProduction) {
    fase('indices', 'iniciando sincronización de índices en segundo plano');
    void sincronizarIndicesEnSegundoPlano(
      app.get<Connection>(getConnectionToken()),
    );
  }
 
  LoggerService.banner({ port, env: isProduction ? 'Production' : 'Development', swagger: !isProduction });
  LoggerService.system({ status: 'ready', port, env: isProduction ? 'production' : 'development', swagger: !isProduction });
}
 
bootstrap().catch((err: Error) => {
  fase('nest', `ERROR fatal al arrancar: ${err?.stack ?? err}`);
  process.exit(1);
});

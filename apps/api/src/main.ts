import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser = require('cookie-parser');
import express = require('express');
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
 
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerService } from './common/logger';
 
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Render corre la app detrás de un proxy inverso: sin esto, Express ve
  // todas las peticiones como si vinieran de la IP interna del proxy, y el
  // rate limiting de @nestjs/throttler (que usa req.ip) termina compartiendo
  // el mismo cupo entre todos los usuarios en vez de contarlos por IP real.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);
 
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const isProduction = config.get('NODE_ENV') === 'production';
 
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
 
  const uploadsDir = config.get<string>('STORAGE_PATH') || join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
 
  // CORS: en producción, el/los origin(es) permitidos vienen de la variable
  // de entorno FRONTEND_URL (configurada en Render). Nunca hardcodear el
  // dominio aquí — si necesitas permitir varios orígenes (ej. www y sin www,
  // o un dominio custom además del de Netlify), sepáralos por comas en la
  // variable de entorno y haz el split abajo.
  const frontendUrl = config.get<string>('FRONTEND_URL');
 
  if (isProduction && !frontendUrl) {
    throw new Error(
      'FRONTEND_URL no está configurada. Es requerida en producción para CORS.',
    );
  }
 
  const allowedOrigins = isProduction
    ? frontendUrl!.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3002'];
 
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
 
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
 
  await app.listen(port);
 
  LoggerService.banner({ port, env: isProduction ? 'Production' : 'Development', swagger: !isProduction });
  LoggerService.system({ status: 'ready', port, env: isProduction ? 'production' : 'development', swagger: !isProduction });
}
 
bootstrap();
 
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
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

  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const isProduction = config.get('NODE_ENV') === 'production';

  app.use(helmet());
  app.use(cookieParser());

  const uploadsDir = config.get<string>('STORAGE_PATH') || join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.enableCors({
    origin: isProduction
      ? ['https://asommmn.example.com']
      : ['http://localhost:3000', 'http://localhost:3002'],
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

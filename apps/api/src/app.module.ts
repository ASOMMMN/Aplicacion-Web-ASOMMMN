import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import { validate } from './config/env.validation';
import { LoggerModule } from './common/logger';
import { StorageModule } from './modules/storage/storage.module';
import { FilesModule } from './modules/files/files.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PostulantesModule } from './modules/postulantes/postulantes.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { EvaluacionesModule } from './modules/evaluaciones/evaluaciones.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { MFAModule } from './modules/mfa/mfa.module';
import { CursosModule } from './modules/cursos/cursos.module';
import { BitacoraEmbarqueModule } from './modules/bitacora-embarque/bitacora-embarque.module';
import { IngestIaModule } from './modules/ingest-ia/ingest-ia.module';
import { EvalArchivosModule } from './modules/eval-archivos/eval-archivos.module';
import { DocsPersonalesModule } from './modules/docs-personales/docs-personales.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { MiNubeModule } from './modules/mi-nube/mi-nube.module';
import { AlertasVencimientoModule } from './modules/alertas-vencimiento/alertas-vencimiento.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env'],
    }),

    // ── Logging ─────────────────────────────────────────────────────────────
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf((info) => {
              const timestamp = info.timestamp as string;
              const level = info.level;
              const message = String(info.message);
              const context = (info as Record<string, unknown>)['context'] as
                | string
                | undefined;
              const lvColors: Record<string, string> = {
                error: '\x1b[91m',
                warn: '\x1b[93m',
                info: '\x1b[94m',
                verbose: '\x1b[90m',
                debug: '\x1b[90m',
              };
              const col = lvColors[level] ?? '\x1b[37m';
              return `\x1b[90m[${timestamp}]\x1b[0m ${col}${level.toUpperCase()}\x1b[0m \x1b[90m[${context ?? 'Nest'}]\x1b[0m ${message}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
    LoggerModule,

    // ── Base de datos ────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
        // TEMP DEBUG - eliminar después de diagnosticar el 401 post-migración a Render
        connectionFactory: (connection: {
          on: (event: string, cb: () => void) => void;
          host: string;
          name: string;
        }) => {
          connection.on('connected', () => {
            console.log(
              `[TEMP-DEBUG] Mongo conectado -> host=${connection.host}, db=${connection.name}`,
            );
          });
          return connection;
        },
      }),
    }),

    // ── Rate limiting global ─────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minuto
        limit: 60, // 60 req/min por defecto
      },
    ]),

    // ── Tareas programadas (cron) ────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Módulos de dominio ───────────────────────────────────────────────────
    TerminusModule,
    StorageModule,
    FilesModule,
    NotificacionesModule,
    AuthModule,
    UsuariosModule,
    PostulantesModule,
    DocumentosModule,
    EvaluacionesModule,
    ReportesModule,
    CursosModule,
    BitacoraEmbarqueModule,
    AuditoriaModule,
    MFAModule,
    IngestIaModule,
    EvalArchivosModule,
    DocsPersonalesModule,
    ChatbotModule,
    MiNubeModule,
    AlertasVencimientoModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerGuard global; se puede sobreescribir por endpoint con @Throttle()
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

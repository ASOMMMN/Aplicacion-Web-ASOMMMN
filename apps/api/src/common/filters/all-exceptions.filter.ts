import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../logger';
import { traducirErrorMongoose } from '../utils/errores-mongoose.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Errores de Mongoose/MongoDB sin capturar (ValidationError, CastError,
    // índice único): son errores del cliente (400/409), no del servidor.
    const mongoose =
      exception instanceof HttpException
        ? null
        : traducirErrorMongoose(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (mongoose?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : (mongoose?.body ?? 'Internal server error');

    const message =
      typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as Record<string, unknown>)['message']
          ? String((rawResponse as Record<string, unknown>)['message'])
          : JSON.stringify(rawResponse);

    LoggerService.error({
      route: `${request.method} ${request.url}`,
      message,
      status,
      stack: exception instanceof Error ? exception.stack : undefined,
      context: AllExceptionsFilter.name,
    });

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: rawResponse,
    });
  }
}

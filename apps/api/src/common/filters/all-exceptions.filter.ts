import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // ID mal formado que llegó a Mongoose sin ParseObjectIdPipe: es un 400,
    // no un error del servidor.
    const idInvalido =
      exception instanceof Error &&
      exception.name === 'CastError' &&
      (exception as Error & { kind?: string }).kind === 'ObjectId';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : idInvalido
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : idInvalido
          ? {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'El identificador no es válido.',
              error: 'Bad Request',
            }
          : 'Internal server error';

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

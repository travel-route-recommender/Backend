import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

export function isDatabaseUnavailable(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  if (
    [
      'MongoNotConnectedError',
      'MongoServerSelectionError',
      'MongooseServerSelectionError',
    ].includes(exception.name)
  ) {
    return true;
  }

  return (
    exception.message.includes('before initial connection is complete') ||
    exception.message.includes('Client must be connected')
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const responseBody =
        typeof res === 'object' && res !== null
          ? (res as Record<string, unknown>)
          : {};
      const message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message;

      response.status(status).json({
        statusCode: status,
        ...(typeof responseBody.code === 'string'
          ? { code: responseBody.code }
          : {}),
        message: Array.isArray(message) ? message.join(', ') : message,
        ...(typeof responseBody.retryAfter === 'number'
          ? { retryAfter: responseBody.retryAfter }
          : {}),
        ...(typeof responseBody.details === 'object' &&
        responseBody.details !== null &&
        !Array.isArray(responseBody.details)
          ? { details: responseBody.details }
          : {}),
        error: exception.name,
      });
      return;
    }

    if (isDatabaseUnavailable(exception)) {
      this.logger.warn('Request rejected because MongoDB is unavailable');
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database temporarily unavailable',
        error: 'ServiceUnavailable',
      });
      return;
    }

    const error = exception instanceof Error ? exception : undefined;
    this.logger.error(
      error?.message ?? 'Unhandled non-error exception',
      error?.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    });
  }
}

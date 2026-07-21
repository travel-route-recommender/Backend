import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string | string[] | undefined;
      let extra: Record<string, unknown> = {};

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res != null) {
        const obj = res as Record<string, unknown>;
        message = obj.message as string | string[] | undefined;
        const { message: _m, statusCode: _s, error: _e, ...rest } = obj;
        extra = rest;
      }

      response.status(status).json({
        statusCode: status,
        message: Array.isArray(message) ? message.join(', ') : message,
        error: exception.name,
        ...extra,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    });
  }
}

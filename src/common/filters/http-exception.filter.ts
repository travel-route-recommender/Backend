import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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
        extra = { ...obj };
        delete extra.message;
        delete extra.statusCode;
        delete extra.error;
      }

      response.status(status).json({
        statusCode: status,
        message: Array.isArray(message) ? message.join(', ') : message,
        error: exception.name,
        ...extra,
      });
      return;
    }

    const error = exception as {
      name?: string;
      message?: string;
      stack?: string;
      code?: number;
    };
    if (error?.name === 'CastError' || error?.name === 'BSONError') {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: '요청 식별자 형식이 올바르지 않습니다.',
        error: 'BadRequest',
        code: 'INVALID_IDENTIFIER',
      });
      return;
    }
    if (error?.code === 11000) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: '이미 존재하는 정보입니다.',
        error: 'Conflict',
        code: 'DUPLICATE_RESOURCE',
      });
      return;
    }

    this.logger.error(
      `${request.method} ${request.originalUrl} 처리 중 예외: ${error?.name ?? 'UnknownError'}: ${error?.message ?? '내용 없음'}`,
      error?.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      error: 'InternalServerError',
    });
  }
}

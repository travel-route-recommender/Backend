import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthCryptoService } from '../../auth/auth-crypto.service';
import { RequestContextService } from '../../auth/request-context.service';
import { SecurityStoreService } from '../../auth/security-store.service';
import {
  RATE_LIMIT_KEY,
  RateLimitPolicy,
} from '../decorators/rate-limit.decorator';

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: SecurityStoreService,
    private readonly crypto: AuthCryptoService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const client = this.requestContext.fromRequest(request, {});
    const route = request.route as { path?: string } | undefined;
    const key = this.crypto.hashIdentifier(
      `${request.method}:${route?.path ?? request.path}:${client.ipPrefix}`,
    );
    const count = await this.store.hitSlidingWindow(
      `security:public-api:${key}`,
      policy.windowSeconds,
    );
    if (count > policy.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'API_RATE_LIMITED',
          message: 'Too many requests',
          retryAfter: policy.windowSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

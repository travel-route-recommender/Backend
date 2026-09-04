import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Request, Response } from 'express';

const RATE_LIMIT = 'app:rate-limit';

type RateLimitOptions = {
  group: string;
  limit: number;
  windowMs: number;
  identityField?: string;
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT, options);

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private requestsSinceCleanup = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    this.cleanup(now);
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const identityValue = options.identityField
      ? this.readField(request, options.identityField)
      : request.headers.authorization;
    const keys = new Set([`${options.group}:ip:${this.hash(ip)}`]);
    if (identityValue) {
      keys.add(`${options.group}:id:${this.hash(identityValue.toLowerCase())}`);
    }

    let retryAfterSeconds = 0;
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.resetAt > now && bucket.count >= options.limit) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.ceil((bucket.resetAt - now) / 1000),
        );
      }
    }
    if (retryAfterSeconds > 0) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      } else {
        bucket.count += 1;
      }
    }
    return true;
  }

  private readField(request: Request, field: string): string | undefined {
    const value = (request.body as Record<string, unknown> | undefined)?.[
      field
    ];
    return typeof value === 'string' && value ? value : undefined;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private cleanup(now: number) {
    this.requestsSinceCleanup += 1;
    if (this.requestsSinceCleanup < 100 && this.buckets.size < 10_000) return;
    this.requestsSinceCleanup = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

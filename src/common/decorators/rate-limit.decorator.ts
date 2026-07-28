import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'route_rate_limit';
export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, {
    limit,
    windowSeconds,
  } satisfies RateLimitPolicy);

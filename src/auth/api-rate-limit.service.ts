import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthCryptoService } from './auth-crypto.service';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class ApiRateLimitService {
  constructor(
    private readonly store: SecurityStoreService,
    private readonly crypto: AuthCryptoService,
  ) {}

  async assertAllowed(
    sessionId: string,
    path: string,
    ipPrefix: string,
  ): Promise<void> {
    const isExpensive = path.includes('/duri/');
    const limit = isExpensive ? 5 : 120;
    const scope = isExpensive ? 'duri' : 'general';
    const [sessionCount, ipCount] = await Promise.all([
      this.store.hitSlidingWindow(
        `security:api:${scope}:session:${sessionId}`,
        60,
      ),
      this.store.hitSlidingWindow(
        `security:api:${scope}:ip:${this.crypto.hashIdentifier(ipPrefix)}`,
        60,
      ),
    ]);
    if (sessionCount > limit || ipCount > limit * 5) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'API_RATE_LIMITED',
          message: 'Too many requests',
          retryAfter: 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

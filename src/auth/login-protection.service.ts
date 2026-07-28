import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthCryptoService } from './auth-crypto.service';
import { ClientContext } from './auth.types';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class LoginProtectionService {
  private static readonly WINDOW_SECONDS = 15 * 60;
  private static readonly MAX_ACCOUNT_FAILURES = 5;
  private static readonly MAX_IP_FAILURES = 50;

  constructor(
    private readonly store: SecurityStoreService,
    private readonly crypto: AuthCryptoService,
  ) {}

  async assertAllowed(email: string, context: ClientContext): Promise<void> {
    const keys = this.keys(email, context);
    const blockedUntil = Math.max(
      Number((await this.store.get(keys.accountBlock)) ?? 0),
      Number((await this.store.get(keys.ipBlock)) ?? 0),
    );
    const retryAfter = Math.ceil((blockedUntil - Date.now()) / 1_000);
    if (retryAfter > 0) this.throwLimited(retryAfter);
  }

  async recordFailure(email: string, context: ClientContext): Promise<void> {
    const keys = this.keys(email, context);
    const [accountFailures, pairFailures, ipFailures] = await Promise.all([
      this.store.hitSlidingWindow(
        keys.accountFailures,
        LoginProtectionService.WINDOW_SECONDS,
      ),
      this.store.hitSlidingWindow(
        keys.pairFailures,
        LoginProtectionService.WINDOW_SECONDS,
      ),
      this.store.hitSlidingWindow(
        keys.ipFailures,
        LoginProtectionService.WINDOW_SECONDS,
      ),
    ]);

    if (
      accountFailures >= LoginProtectionService.MAX_ACCOUNT_FAILURES ||
      pairFailures >= LoginProtectionService.MAX_ACCOUNT_FAILURES
    ) {
      const lockNumber = await this.store.increment(
        keys.lockCount,
        24 * 60 * 60,
      );
      const lockSeconds = Math.min(30 * 60, 5 * 60 * 2 ** (lockNumber - 1));
      await this.store.set(
        keys.accountBlock,
        String(Date.now() + lockSeconds * 1_000),
        lockSeconds,
      );
      this.throwLimited(lockSeconds);
    }

    if (ipFailures >= LoginProtectionService.MAX_IP_FAILURES) {
      const lockSeconds = 15 * 60;
      await this.store.set(
        keys.ipBlock,
        String(Date.now() + lockSeconds * 1_000),
        lockSeconds,
      );
      this.throwLimited(lockSeconds);
    }
  }

  async recordSuccess(email: string, context: ClientContext): Promise<void> {
    const keys = this.keys(email, context);
    await this.store.delete(
      keys.accountFailures,
      keys.pairFailures,
      keys.accountBlock,
    );
  }

  private keys(email: string, context: ClientContext) {
    const account = this.crypto.hashIdentifier(
      `account:${this.crypto.normalizeEmail(email)}`,
    );
    const ip = this.crypto.hashIdentifier(`ip:${context.ipPrefix}`);
    const installation = this.crypto.hashIdentifier(
      `installation:${context.installationId}`,
    );
    return {
      accountFailures: `security:login:account:${account}`,
      pairFailures: `security:login:pair:${account}:${ip}:${installation}`,
      ipFailures: `security:login:ip:${ip}`,
      accountBlock: `security:login:block:account:${account}`,
      ipBlock: `security:login:block:ip:${ip}`,
      lockCount: `security:login:locks:${account}`,
    };
  }

  private throwLimited(retryAfter: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'LOGIN_RATE_LIMITED',
        message: 'Too many login attempts. Try again later.',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

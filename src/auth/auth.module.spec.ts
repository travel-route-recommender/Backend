import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { PublicRateLimitGuard } from '../common/guards/public-rate-limit.guard';
import { AuthModule } from './auth.module';

describe('AuthModule authorization wiring', () => {
  it('registers only the public rate limit guard globally', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];

    const globalGuards = providers.filter(
      (provider: { provide?: unknown }) => provider?.provide === APP_GUARD,
    );
    expect(globalGuards).toEqual([
      { provide: APP_GUARD, useClass: PublicRateLimitGuard },
    ]);
  });
});

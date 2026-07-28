import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth.module';

describe('AuthModule authorization wiring', () => {
  it('does not register ScopesGuard as a global guard', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];

    expect(providers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ provide: APP_GUARD })]),
    );
  });
});

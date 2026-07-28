import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { AuthCryptoService } from './auth-crypto.service';
import { ClientContext } from './auth.types';
import { LoginProtectionService } from './login-protection.service';
import { SecurityStoreService } from './security-store.service';

describe('LoginProtectionService', () => {
  const config = new ConfigService({
    SECURITY_HASH_KEY: 'test-security-hash-key-with-more-than-32-bytes',
  });
  const store = new SecurityStoreService(config);
  const crypto = new AuthCryptoService(config);
  const service = new LoginProtectionService(store, crypto);
  const context: ClientContext = {
    installationId: 'test-installation-id-0001',
    platform: 'android',
    ip: '203.0.113.10',
    ipPrefix: '203.0.113.0/24',
  };

  it('limits password login on the fifth failure', async () => {
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        service.recordFailure('user@example.com', context),
      ).resolves.toBeUndefined();
    }

    await expect(
      service.recordFailure('user@example.com', context),
    ).rejects.toMatchObject<HttpException>({ status: 429 });
    await expect(
      service.assertAllowed('user@example.com', context),
    ).rejects.toMatchObject<HttpException>({ status: 429 });
  });
});

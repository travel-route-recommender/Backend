import { ConfigService } from '@nestjs/config';
import { AuthCryptoService } from './auth-crypto.service';

describe('AuthCryptoService', () => {
  const service = new AuthCryptoService(
    new ConfigService({
      SECURITY_HASH_KEY: 'test-security-hash-key-with-more-than-32-bytes',
      REFRESH_RESPONSE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    }),
  );

  it('encrypts and authenticates an idempotent refresh response', () => {
    const encrypted = service.encryptJson({ refreshToken: 'secret', count: 1 });
    expect(encrypted).not.toContain('secret');
    expect(service.decryptJson(encrypted)).toEqual({
      refreshToken: 'secret',
      count: 1,
    });

    const parts = encrypted.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    expect(() => service.decryptJson(parts.join('.'))).toThrow();
  });

  it('normalizes email and hashes tokens deterministically', () => {
    expect(service.normalizeEmail(' Test@Example.COM ')).toBe(
      'test@example.com',
    );
    expect(service.hashToken('R0')).toBe(service.hashToken('R0'));
    expect(service.hashToken('R0')).not.toBe(service.hashToken('R1'));
  });
});

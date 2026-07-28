import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import { TokenService } from './token.service';

function rsaKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

describe('TokenService RSA key ring', () => {
  const active = rsaKeyPair();
  const previous = rsaKeyPair();
  const jwt = new JwtService();
  const service = new TokenService(
    jwt,
    new ConfigService({
      JWT_ISSUER: 'https://auth.test',
      JWT_AUDIENCE: 'tourmate-api',
      JWT_ACCESS_KEY_ID: 'access-2026-07',
      JWT_ACCESS_PRIVATE_KEY_BASE64: Buffer.from(active.privateKey).toString(
        'base64',
      ),
      JWT_ACCESS_PUBLIC_KEY_BASE64: Buffer.from(active.publicKey).toString(
        'base64',
      ),
      JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON: JSON.stringify({
        'access-2026-04': Buffer.from(previous.publicKey).toString('base64'),
      }),
    }),
  );

  it('signs with the active key and selects verification keys by kid', async () => {
    const activeToken = await service.issueAccessToken({
      userId: 'user-id',
      sessionId: 'session-id',
      scopes: ['profile:read'],
      accountType: 'member',
      securityVersion: 1,
    });
    expect(service.verificationKeyForToken(activeToken)).toBe(active.publicKey);

    const previousToken = await jwt.signAsync(
      {
        sub: 'user-id',
        sid: 'session-id',
        scope: ['profile:read'],
        account_type: 'member',
        ver: 1,
      },
      {
        privateKey: previous.privateKey,
        algorithm: 'RS256',
        keyid: 'access-2026-04',
        issuer: 'https://auth.test',
        audience: 'tourmate-api',
        expiresIn: '15m',
      },
    );
    expect(service.verificationKeyForToken(previousToken)).toBe(
      previous.publicKey,
    );
  });

  it('publishes active and previous public keys in JWKS', () => {
    const jwks = service.getJwks();
    expect(jwks.keys.map((key) => key.kid)).toEqual([
      'access-2026-07',
      'access-2026-04',
    ]);
    expect(jwks.keys.every((key) => key.use === 'sig')).toBe(true);
  });

  it('rejects unknown key ids before signature verification', async () => {
    const unknownToken = await jwt.signAsync(
      { sub: 'user-id' },
      {
        privateKey: previous.privateKey,
        algorithm: 'RS256',
        keyid: 'unknown-key',
      },
    );
    expect(() => service.verificationKeyForToken(unknownToken)).toThrow(
      'JWT key id is unknown',
    );
  });
});

import { generateKeyPairSync } from 'crypto';
import { validateEnvironment } from './env.validation';

function rsaKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

function productionEnvironment() {
  const active = rsaKeyPair();
  const previous = rsaKeyPair();
  return {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://database.example/tourmate',
    REDIS_URL: 'rediss://redis.example:6379',
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
    SECURITY_HASH_KEY: 'production-security-hash-key-with-32-bytes',
    REFRESH_RESPONSE_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    GOOGLE_OIDC_AUDIENCES: 'google-client-id',
    KAKAO_OIDC_AUDIENCES: 'kakao-client-id',
    KAKAO_OIDC_CLIENT_ID: 'kakao-client-id',
    KAKAO_OIDC_CLIENT_SECRET: 'kakao-client-secret',
    KAKAO_OIDC_MOBILE_REDIRECT_URIS: 'tripmatch://auth/callback/kakao',
  };
}

describe('validateEnvironment', () => {
  it('accepts a valid production RSA key ring', () => {
    expect(() => validateEnvironment(productionEnvironment())).not.toThrow();
  });

  it('rejects a mismatched private and public key pair', () => {
    const environment = productionEnvironment();
    const unrelated = rsaKeyPair();
    environment.JWT_ACCESS_PUBLIC_KEY_BASE64 = Buffer.from(
      unrelated.publicKey,
    ).toString('base64');
    expect(() => validateEnvironment(environment)).toThrow(
      'do not form a valid pair',
    );
  });

  it('requires TLS for production Redis unless explicitly overridden', () => {
    const environment = productionEnvironment();
    environment.REDIS_URL = 'redis://redis.example:6379';
    expect(() => validateEnvironment(environment)).toThrow('rediss://');

    expect(() =>
      validateEnvironment({
        ...environment,
        REDIS_TLS_REQUIRED: 'false',
      }),
    ).not.toThrow();
  });
});

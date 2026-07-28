import { createPublicKey } from 'crypto';

const REQUIRED_PRODUCTION_VALUES = [
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_ACCESS_KEY_ID',
  'JWT_ACCESS_PRIVATE_KEY_BASE64',
  'JWT_ACCESS_PUBLIC_KEY_BASE64',
  'SECURITY_HASH_KEY',
  'REFRESH_RESPONSE_ENCRYPTION_KEY',
  'GOOGLE_OIDC_AUDIENCES',
  'KAKAO_OIDC_AUDIENCES',
  'KAKAO_OIDC_CLIENT_ID',
  'KAKAO_OIDC_CLIENT_SECRET',
  'KAKAO_OIDC_MOBILE_REDIRECT_URIS',
] as const;

function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const config = { ...input };
  const isProduction = config.NODE_ENV === 'production';

  if (!isProduction) return config;

  const missing = REQUIRED_PRODUCTION_VALUES.filter(
    (key) => !hasValue(config[key]),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    );
  }

  const redisUrl = String(config.REDIS_URL);
  if (!/^rediss?:\/\//.test(redisUrl)) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (
    config.REDIS_TLS_REQUIRED !== 'false' &&
    !redisUrl.startsWith('rediss://')
  ) {
    throw new Error(
      'Production REDIS_URL must use rediss:// unless REDIS_TLS_REQUIRED=false is explicitly set',
    );
  }

  const privateKey = Buffer.from(
    String(config.JWT_ACCESS_PRIVATE_KEY_BASE64),
    'base64',
  ).toString('utf8');
  const publicKey = Buffer.from(
    String(config.JWT_ACCESS_PUBLIC_KEY_BASE64),
    'base64',
  ).toString('utf8');
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('JWT_ACCESS_PRIVATE_KEY_BASE64 is not a PKCS#8 PEM key');
  }
  if (!publicKey.includes('BEGIN PUBLIC KEY')) {
    throw new Error('JWT_ACCESS_PUBLIC_KEY_BASE64 is not an SPKI PEM key');
  }
  const keyId = String(config.JWT_ACCESS_KEY_ID);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) {
    throw new Error('JWT_ACCESS_KEY_ID has an invalid format');
  }
  try {
    const derivedPublicKey = createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    });
    const configuredPublicKey = createPublicKey(publicKey).export({
      type: 'spki',
      format: 'der',
    });
    if (!derivedPublicKey.equals(configuredPublicKey)) {
      throw new Error('key mismatch');
    }
  } catch {
    throw new Error('JWT access private/public keys do not form a valid pair');
  }

  validatePreviousJwtPublicKeys(
    config.JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON,
    keyId,
  );

  const encryptionKey = Buffer.from(
    String(config.REFRESH_RESPONSE_ENCRYPTION_KEY),
    'base64',
  );
  if (encryptionKey.length !== 32) {
    throw new Error(
      'REFRESH_RESPONSE_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }

  const weakValues = ['change-me-access-secret', 'change-me-refresh-secret'];
  for (const key of ['SECURITY_HASH_KEY', 'JWT_ACCESS_SECRET']) {
    const value = config[key];
    if (hasValue(value) && weakValues.includes(value)) {
      throw new Error(`${key} contains an unsafe placeholder value`);
    }
  }

  if (String(config.SECURITY_HASH_KEY).length < 32) {
    throw new Error('SECURITY_HASH_KEY must contain at least 32 characters');
  }
  validateKakaoMobileOidc(config);

  return config;
}

function validateKakaoMobileOidc(config: Record<string, unknown>): void {
  const clientId = String(config.KAKAO_OIDC_CLIENT_ID);
  const audiences = String(config.KAKAO_OIDC_AUDIENCES)
    .split(',')
    .map((value) => value.trim());
  if (!audiences.includes(clientId)) {
    throw new Error('KAKAO_OIDC_CLIENT_ID must be an accepted Kakao audience');
  }
  if (String(config.KAKAO_OIDC_CLIENT_SECRET).length < 16) {
    throw new Error('KAKAO_OIDC_CLIENT_SECRET is too short');
  }
  for (const rawValue of String(config.KAKAO_OIDC_MOBILE_REDIRECT_URIS).split(
    ',',
  )) {
    let url: URL;
    try {
      url = new URL(rawValue.trim());
    } catch {
      throw new Error(
        'KAKAO_OIDC_MOBILE_REDIRECT_URIS contains an invalid URL',
      );
    }
    if (url.protocol !== 'tripmatch:') {
      throw new Error(
        'Production Kakao mobile redirect URIs must use the tripmatch scheme',
      );
    }
  }
}

function validatePreviousJwtPublicKeys(
  value: unknown,
  activeKeyId: string,
): void {
  if (!hasValue(value)) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON is invalid JSON');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(
      'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON must be a JSON object',
    );
  }

  for (const [keyId, encodedKey] of Object.entries(parsed)) {
    if (keyId === activeKeyId) {
      throw new Error(
        'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON contains the active key id',
      );
    }
    if (
      !/^[A-Za-z0-9._-]{1,128}$/.test(keyId) ||
      typeof encodedKey !== 'string'
    ) {
      throw new Error(
        'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON contains an invalid entry',
      );
    }
    const publicKey = Buffer.from(encodedKey, 'base64').toString('utf8');
    try {
      createPublicKey(publicKey);
    } catch {
      throw new Error(`Previous JWT public key ${keyId} is invalid`);
    }
    if (!publicKey.includes('BEGIN PUBLIC KEY')) {
      throw new Error(
        `Previous JWT public key ${keyId} is not an SPKI PEM key`,
      );
    }
  }
}

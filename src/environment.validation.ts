const INSECURE_SECRET_VALUES = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'dev-upload-signing-secret',
]);

function requireString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be configured in production`);
  }
  return value.trim();
}

function requireSecret(config: Record<string, unknown>, key: string): string {
  const value = requireString(config, key);
  if (value.length < 32 || INSECURE_SECRET_VALUES.has(value)) {
    throw new Error(
      `${key} must be a non-default secret of at least 32 characters`,
    );
  }
  return value;
}

/** Fail fast before a production server can start with development credentials. */
export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (config.NODE_ENV !== 'production') return config;

  requireString(config, 'MONGODB_URI');
  const accessSecret = requireSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET');
  const uploadSigningSecret = requireSecret(config, 'UPLOAD_SIGNING_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  if (
    uploadSigningSecret === accessSecret ||
    uploadSigningSecret === refreshSecret
  ) {
    throw new Error(
      'UPLOAD_SIGNING_SECRET must differ from both JWT signing secrets',
    );
  }
  const uploadsPublic = config.UPLOADS_PUBLIC;
  if (
    uploadsPublic === true ||
    (typeof uploadsPublic === 'string' &&
      uploadsPublic.trim().toLowerCase() === 'true')
  ) {
    throw new Error(
      'UPLOADS_PUBLIC must be false in production; use signed download URLs',
    );
  }

  const appBaseUrl = requireString(config, 'APP_BASE_URL');
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(appBaseUrl);
  } catch {
    throw new Error('APP_BASE_URL must be an absolute URL');
  }
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use https in production');
  }

  const corsOrigins = requireString(config, 'CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!corsOrigins.length) {
    throw new Error('CORS_ORIGINS must contain at least one web origin');
  }
  for (const origin of corsOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin.replace(/\/$/, '') ||
      parsed.pathname !== '/'
    ) {
      throw new Error(
        `CORS_ORIGINS must contain only http(s) origins: ${origin}`,
      );
    }
  }

  return config;
}

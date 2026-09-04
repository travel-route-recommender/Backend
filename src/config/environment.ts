import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z
      .string()
      .trim()
      .default('mongodb://127.0.0.1:27017/tourmate'),
    JWT_ACCESS_SECRET: z.string().trim().default('change-me-access-secret'),
    JWT_REFRESH_SECRET: z.string().trim().default('change-me-refresh-secret'),
    APP_BASE_URL: z.string().trim().default('http://localhost:3000'),
    KAKAO_REST_API_KEY: z.string().trim().optional(),
    TOUR_API_SERVICE_KEY: z.string().trim().optional(),
    UPLOAD_SIGNING_SECRET: z.string().trim().optional(),
    UPLOADS_PUBLIC: z.enum(['true', 'false']).default('false'),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    CORS_ORIGINS: z.string().default(''),
    RATE_LIMIT_TTL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(120),
  })
  .passthrough();

type Environment = z.infer<typeof environmentSchema>;

const REQUIRED_PRODUCTION_KEYS: ReadonlyArray<keyof Environment> = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'APP_BASE_URL',
  'KAKAO_REST_API_KEY',
  'TOUR_API_SERVICE_KEY',
  'UPLOAD_SIGNING_SECRET',
];

function validateProductionEnvironment(environment: Environment): void {
  const errors: string[] = [];

  for (const key of REQUIRED_PRODUCTION_KEYS) {
    const value = environment[key];
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`${key} is required`);
    }
  }

  if (/localhost|127\.0\.0\.1/i.test(environment.MONGODB_URI)) {
    errors.push('MONGODB_URI must point to a production database');
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(environment.MONGODB_URI)) {
    errors.push('MONGODB_URI must use mongodb:// or mongodb+srv://');
  }

  for (const key of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'UPLOAD_SIGNING_SECRET',
  ] as const) {
    const value = environment[key];
    if (!value || value.length < 32 || value.startsWith('change-me-')) {
      errors.push(
        `${key} must be a non-default secret of at least 32 characters`,
      );
    }
  }

  if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  try {
    const appBaseUrl = new URL(environment.APP_BASE_URL);
    if (appBaseUrl.protocol !== 'https:') {
      errors.push('APP_BASE_URL must use HTTPS');
    }
  } catch {
    errors.push('APP_BASE_URL must be a valid URL');
  }

  if (environment.UPLOADS_PUBLIC === 'true') {
    errors.push('UPLOADS_PUBLIC must be false in production');
  }

  if (
    environment.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')
  ) {
    errors.push('CORS_ORIGINS cannot contain * in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production environment:\n- ${errors.join('\n- ')}`,
    );
  }
}

export function validateEnvironment(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }

  if (result.data.NODE_ENV === 'production') {
    validateProductionEnvironment(result.data);
  }

  return result.data;
}

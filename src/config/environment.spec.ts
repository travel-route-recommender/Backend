import { validateEnvironment } from './environment';

const validProductionEnvironment = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:password@example.mongodb.net/tourmate',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  UPLOAD_SIGNING_SECRET: 'c'.repeat(32),
  APP_BASE_URL: 'https://api.example.com',
  KAKAO_REST_API_KEY: 'kakao-key',
  TOUR_API_SERVICE_KEY: 'tour-key',
  UPLOADS_PUBLIC: 'false',
};

describe('validateEnvironment', () => {
  it('uses safe defaults outside production', () => {
    expect(validateEnvironment({ NODE_ENV: 'test' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      UPLOADS_PUBLIC: 'false',
      RATE_LIMIT_TTL_MS: 60_000,
      RATE_LIMIT_MAX: 120,
    });
  });

  it('accepts a complete production configuration', () => {
    expect(validateEnvironment(validProductionEnvironment)).toMatchObject(
      validProductionEnvironment,
    );
  });

  it('rejects development secrets and endpoints in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/tourmate',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        APP_BASE_URL: 'http://localhost:3000',
      }),
    ).toThrow('Invalid production environment');
  });

  it('rejects public uploads and wildcard CORS in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        UPLOADS_PUBLIC: 'true',
        CORS_ORIGINS: '*',
      }),
    ).toThrow('Invalid production environment');
  });
});

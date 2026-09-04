import { validateEnvironment } from './environment.validation';

const validProduction = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://database/tourmate',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  UPLOAD_SIGNING_SECRET: 'c'.repeat(32),
  UPLOADS_PUBLIC: 'false',
  APP_BASE_URL: 'https://api.example.com',
  CORS_ORIGINS: 'https://app.example.com',
};

describe('validateEnvironment', () => {
  it('개발 환경은 기존 기본값을 허용한다', () => {
    expect(validateEnvironment({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'development',
    });
  });

  it('운영 환경의 기본 JWT secret을 거부한다', () => {
    expect(() =>
      validateEnvironment({
        ...validProduction,
        JWT_ACCESS_SECRET: 'change-me-access-secret',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('경로가 포함된 CORS 값을 거부한다', () => {
    expect(() =>
      validateEnvironment({
        ...validProduction,
        CORS_ORIGINS: 'https://app.example.com/path',
      }),
    ).toThrow('CORS_ORIGINS');
  });

  it('운영 환경에 전용 업로드 서명 secret을 요구한다', () => {
    expect(() =>
      validateEnvironment({
        ...validProduction,
        UPLOAD_SIGNING_SECRET: '',
      }),
    ).toThrow('UPLOAD_SIGNING_SECRET');
    expect(() =>
      validateEnvironment({
        ...validProduction,
        UPLOAD_SIGNING_SECRET: validProduction.JWT_ACCESS_SECRET,
      }),
    ).toThrow('UPLOAD_SIGNING_SECRET');
  });

  it('운영 환경의 정적 uploads 공개를 거부한다', () => {
    expect(() =>
      validateEnvironment({
        ...validProduction,
        UPLOADS_PUBLIC: 'true',
      }),
    ).toThrow('UPLOADS_PUBLIC');
  });

  it('안전한 운영 설정을 통과시킨다', () => {
    expect(validateEnvironment(validProduction)).toBe(validProduction);
  });
});

import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));

import { configureHttpApplication } from './main';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TestModule {}

async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [TestModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();

  configureHttpApplication(
    app,
    new ConfigService({
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'https://allowed.example',
      UPLOADS_PUBLIC: 'false',
    }),
  );
  await app.init();
  return app;
}

describe('HTTP application configuration', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets security headers and disables production Swagger', async () => {
    const probe = await request(app.getHttpServer()).get('/api/v1/probe');
    expect(probe.status).toBe(200);
    expect(probe.headers['x-content-type-options']).toBe('nosniff');
    expect(probe.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(probe.headers['content-security-policy']).toBeDefined();

    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });

  it('allows only configured browser origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/probe')
      .set('Origin', 'https://allowed.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://allowed.example',
    );

    const denied = await request(app.getHttpServer())
      .get('/api/v1/probe')
      .set('Origin', 'https://denied.example');
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns 429 after the configured request limit', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe').expect(200);
    await request(app.getHttpServer()).get('/api/v1/probe').expect(200);
    await request(app.getHttpServer()).get('/api/v1/probe').expect(429);
  });
});

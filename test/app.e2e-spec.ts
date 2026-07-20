import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Tourmate API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  it('/api/v1/quiz/questions (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/quiz/questions')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });
  });

  it('/api/v1/quiz/tags (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/quiz/tags')
      .expect(200)
      .expect((res) => {
        expect(res.body.source).toBe('mock');
        expect(Array.isArray(res.body.tags)).toBe(true);
        expect(res.body.tags.length).toBeGreaterThan(0);
      });
  });

  it('/api/v1/quiz/steps (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/quiz/steps')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(6);
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

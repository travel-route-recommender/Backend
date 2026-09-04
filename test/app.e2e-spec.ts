import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';

describe('Tourmate API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  async function getJson(path: string) {
    const response = await fetch(`${baseUrl}${path}`);
    const body: unknown = await response.json();
    return { status: response.status, body };
  }

  async function postJson(path: string, body: unknown = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    // Node 26에서 supertest가 아직 listen하지 않은 Server를 요청마다 열고 닫으면
    // 다음 요청과 close가 경합해 간헐적으로 ECONNRESET이 발생할 수 있다.
    // 테스트 수명 동안 하나의 loopback listener를 유지해 실제 HTTP 경로를 안정적으로 검증한다.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  it('/api/v1/quiz/questions (GET)', async () => {
    const { status, body } = await getJson('/api/v1/quiz/questions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (!Array.isArray(body)) throw new Error('배열 응답이 필요합니다.');
    expect(body.length).toBeGreaterThan(0);
  });

  it('/api/v1/quiz/tags (GET)', async () => {
    const { status, body } = await getJson('/api/v1/quiz/tags');
    expect(status).toBe(200);
    if (typeof body !== 'object' || body === null) {
      throw new Error('객체 응답이 필요합니다.');
    }
    const payload = body as Record<string, unknown>;
    expect(payload.source).toBe('product-taxonomy');
    expect(Array.isArray(payload.tags)).toBe(true);
    if (!Array.isArray(payload.tags)) {
      throw new Error('tags 배열이 필요합니다.');
    }
    expect(payload.tags.length).toBeGreaterThan(0);
  });

  it('/api/v1/quiz/steps (GET)', async () => {
    const { status, body } = await getJson('/api/v1/quiz/steps');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (!Array.isArray(body)) throw new Error('배열 응답이 필요합니다.');
    expect(body.length).toBeGreaterThan(0);
  });

  it('does not expose unfinished transit, notification, or Duri proposal routes', async () => {
    expect((await postJson('/api/v1/mobility/transit')).status).toBe(404);
    expect((await getJson('/api/v1/notifications')).status).toBe(404);
    expect(
      (
        await postJson(
          '/api/v1/rooms/665abc123def456789012345/duri/generate-draft',
        )
      ).status,
    ).toBe(404);
    expect(
      (await getJson('/api/v1/rooms/665abc123def456789012345/adjustment-plan'))
        .status,
    ).toBe(404);
    expect(
      (await getJson('/api/v1/rooms/665abc123def456789012345/courses')).status,
    ).toBe(404);
    // The production automobile directions route remains registered and guarded.
    expect((await postJson('/api/v1/mobility/directions')).status).toBe(401);
  });

  afterAll(async () => {
    await app.close();
  });
});

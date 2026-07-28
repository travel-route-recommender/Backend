import { ApiRateLimitService } from './api-rate-limit.service';
import { AuthCryptoService } from './auth-crypto.service';
import { SecurityStoreService } from './security-store.service';

describe('ApiRateLimitService', () => {
  const hitSlidingWindow = jest.fn<Promise<number>, [string, number]>();
  const store = {
    hitSlidingWindow,
  } as unknown as SecurityStoreService;
  const crypto = {
    hashIdentifier: (value: string) => `hash:${value}`,
  } as unknown as AuthCryptoService;
  const service = new ApiRateLimitService(store, crypto);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['/api/users/me', 121],
    ['/api/rooms/room-id/duri/optimize', 6],
  ])('keeps the rate limit for %s', async (path, sessionCount) => {
    hitSlidingWindow
      .mockResolvedValueOnce(sessionCount)
      .mockResolvedValueOnce(1);

    await expect(
      service.assertAllowed('session-id', path, '192.0.2.0/24'),
    ).rejects.toMatchObject({
      response: { code: 'API_RATE_LIMITED', retryAfter: 60 },
      status: 429,
    });
  });
});

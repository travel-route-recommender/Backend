import { HttpException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('제한 초과 시 Retry-After와 429를 반환한다', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        group: 'login',
        limit: 2,
        windowMs: 60_000,
        identityField: 'email',
      }),
    };
    const setHeader = jest.fn();
    const request = {
      ip: '127.0.0.1',
      socket: {},
      body: { email: 'person@example.com' },
      headers: {},
    };
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    };
    const guard = new RateLimitGuard(reflector as never);
    expect(guard.canActivate(context as never)).toBe(true);
    expect(guard.canActivate(context as never)).toBe(true);
    try {
      guard.canActivate(context as never);
      throw new Error('429가 발생해야 합니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }
  });
});

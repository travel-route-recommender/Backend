import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from './scopes.guard';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

function executionContext(requiredScopes: string[] | undefined, user?: AuthUser) {
  const handler = function testHandler() {};
  Reflect.defineMetadata(REQUIRED_SCOPES_KEY, requiredScopes, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };
}

describe('ScopesGuard', () => {
  const guard = new ScopesGuard(new Reflector());

  it('allows routes with no required scopes', () => {
    expect(guard.canActivate(executionContext(undefined) as never)).toBe(true);
  });

  it('allows users that have every required scope', () => {
    expect(
      guard.canActivate(
        executionContext(['room:create'], {
          userId: 'user-id',
          sessionId: 'session-id',
          scopes: ['profile:read', 'room:create'],
          accountType: 'member',
          securityVersion: 1,
        }) as never,
      ),
    ).toBe(true);
  });

  it('rejects users missing a required scope', () => {
    expect(() =>
      guard.canActivate(
        executionContext(['room:create'], {
          userId: 'guest-id',
          sessionId: 'session-id',
          scopes: ['profile:read', 'room:read'],
          accountType: 'guest',
          securityVersion: 1,
        }) as never,
      ),
    ).toThrow(ForbiddenException);
  });
});

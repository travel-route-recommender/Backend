import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AuthSessionService } from './auth-session.service';
import { ClientContext } from './auth.types';

function accessService(input: {
  findSessionResult: unknown;
  securityState?: string | null;
}) {
  const exec = jest.fn().mockResolvedValue(input.findSessionResult);
  const select = jest.fn().mockReturnValue({ exec });
  const findOne = jest.fn().mockReturnValue({ select });
  const store = {
    get: jest.fn((key: string) =>
      key.startsWith('security:revoked-session')
        ? Promise.resolve(null)
        : Promise.resolve(input.securityState ?? 'active:1'),
    ),
    set: jest.fn(),
    delete: jest.fn(),
  };
  const apiRateLimit = {
    assertAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthSessionService(
    {} as never,
    { findOne } as never,
    {} as never,
    {} as never,
    {} as never,
    { accessTokenLifetimeSeconds: 900 } as never,
    {} as never,
    apiRateLimit as never,
    store as never,
    new ConfigService({ NODE_ENV: 'test' }),
  );
  return { service, findOne, apiRateLimit };
}

describe('AuthSessionService access validation', () => {
  it('rejects an access token whose sid is not an active session for the user', async () => {
    const { service, findOne, apiRateLimit } = accessService({
      findSessionResult: null,
    });

    await expect(
      service.assertAccessAllowed(
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        1,
        '/api/v1/users/me',
        '203.0.113.0/24',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_REVOKED' },
      status: 401,
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
    expect(apiRateLimit.assertAllowed).not.toHaveBeenCalled();
  });

  it('allows an active session before applying API rate limits', async () => {
    const sessionId = new Types.ObjectId();
    const { service, apiRateLimit } = accessService({
      findSessionResult: { _id: sessionId },
    });

    await expect(
      service.assertAccessAllowed(
        new Types.ObjectId().toString(),
        sessionId.toString(),
        1,
        '/api/v1/users/me',
        '203.0.113.0/24',
      ),
    ).resolves.toBeUndefined();
    expect(apiRateLimit.assertAllowed).toHaveBeenCalledWith(
      sessionId.toString(),
      '/api/v1/users/me',
      '203.0.113.0/24',
    );
  });
});

describe('AuthSessionService refresh context binding', () => {
  const context: ClientContext = {
    installationId: 'correct-installation-id-0001',
    platform: 'ios',
    ip: '203.0.113.10',
    ipPrefix: '203.0.113.0/24',
  };

  it('compromises the session family when a valid refresh token is used from another installation', async () => {
    const sessionId = new Types.ObjectId();
    const familyId = 'family-id';
    const now = Date.now();
    const refreshTokenModel = {
      findOne: jest.fn().mockResolvedValue({
        sessionId,
        expiresAt: new Date(now + 60_000),
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const authSessionModel = {
      findById: jest.fn().mockResolvedValue({
        _id: sessionId,
        tokenFamilyId: familyId,
        installationIdHash: 'hash:installation:other-installation-id-0001',
        status: 'active',
        idleExpiresAt: new Date(now + 60_000),
        absoluteExpiresAt: new Date(now + 120_000),
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const operationModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      }),
    };
    const store = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const service = new AuthSessionService(
      {
        transaction: jest.fn((callback) => callback('mongo-session')),
      } as never,
      authSessionModel as never,
      refreshTokenModel as never,
      operationModel as never,
      {} as never,
      { accessTokenLifetimeSeconds: 900 } as never,
      {
        hashToken: (token: string) => `token:${token}`,
        hashIdentifier: (value: string) => `hash:${value}`,
      } as never,
      {} as never,
      store as never,
      new ConfigService({ NODE_ENV: 'test' }),
    );

    await expect(
      service.refresh(
        'refresh-token-value',
        '00000000-0000-4000-8000-000000000000',
        context,
      ),
    ).rejects.toMatchObject({
      response: { code: 'REFRESH_INVALID' },
      status: 401,
    });
    expect(refreshTokenModel.updateMany).toHaveBeenCalledWith(
      { familyId, status: 'active' },
      { $set: { status: 'revoked' } },
      { session: 'mongo-session' },
    );
    expect(authSessionModel.updateOne).toHaveBeenCalledWith(
      { _id: sessionId },
      {
        $set: expect.objectContaining({
          status: 'compromised',
          revokeReason: 'REFRESH_INSTALLATION_MISMATCH',
        }),
      },
      { session: 'mongo-session' },
    );
    expect(store.set).toHaveBeenCalledWith(
      `security:revoked-session:${sessionId.toString()}`,
      '1',
      900,
    );
  });
});

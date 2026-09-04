import { AuthService } from './auth.service';

describe('AuthService refresh rotation', () => {
  const operationId = '8fb9d9a8-71c3-42fc-9690-c18e274f3122';

  type TestRefreshReceipt = {
    operationId: string;
    requestTokenHash: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };

  type TestUser = {
    _id: { toString(): string };
    email: string;
    nickname: string;
    refreshTokens: string[];
    refreshReceipts: TestRefreshReceipt[];
  };

  function service(rotateSucceeds = true) {
    const user: TestUser = {
      _id: { toString: () => 'user-1' },
      email: 'user@example.com',
      nickname: '여행자',
      refreshTokens: ['refresh-0'],
      refreshReceipts: [],
    };
    let issued = 0;
    const users = {
      findById: jest.fn().mockResolvedValue(user),
      refreshTokenHash: jest.fn().mockReturnValue('refresh-0-hash'),
      findRefreshReceipt: jest
        .fn()
        .mockImplementation(
          (
            _id: string,
            requestedOperationId: string,
            requestTokenHash: string,
          ) => {
            const receipt = user.refreshReceipts.find(
              (entry) =>
                entry.operationId === requestedOperationId &&
                entry.requestTokenHash === requestTokenHash &&
                entry.expiresAt.getTime() > Date.now(),
            );
            return receipt ? { user, receipt } : null;
          },
        ),
      rotateRefreshToken: jest
        .fn()
        .mockImplementation(
          (
            _id: string,
            currentRefreshToken: string,
            nextRefreshToken: string,
            receipt: TestRefreshReceipt,
          ) => {
            if (
              !rotateSucceeds ||
              !user.refreshTokens.includes(currentRefreshToken)
            ) {
              return null;
            }
            user.refreshTokens = [nextRefreshToken];
            user.refreshReceipts = [receipt];
            return user;
          },
        ),
      appendRefreshToken: jest.fn().mockResolvedValue(user),
      toPublicUser: jest.fn().mockImplementation((value: TestUser) => ({
        id: value._id.toString(),
        email: value.email,
        nickname: value.nickname,
      })),
    };
    const jwt = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-1',
        email: user.email,
        typ: 'refresh',
      }),
      sign: jest.fn().mockImplementation((payload: { typ: string }) => {
        issued += 1;
        return `${payload.typ}-${issued}`;
      }),
    };
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    return {
      auth: new AuthService(
        users as never,
        jwt as never,
        config as never,
        {} as never,
      ),
      users,
    };
  }

  it('응답 유실 뒤 같은 operationId로 재시도하면 정확히 같은 세션을 복구한다', async () => {
    const { auth, users } = service();
    const first = await auth.refresh('refresh-0', operationId);
    const retry = await auth.refresh('refresh-0', operationId);

    expect(retry).toEqual(first);
    expect(first.user).toMatchObject({ id: 'user-1', nickname: '여행자' });
    expect(users.rotateRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('이미 소비한 refresh token은 다른 operationId로 재사용할 수 없다', async () => {
    const { auth } = service();
    await auth.refresh('refresh-0', operationId);

    await expect(
      auth.refresh('refresh-0', '248600a6-8045-4eb7-9d21-c27c7ec965ab'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('원자 회전이 실패하고 복구 receipt도 없으면 토큰을 발급하지 않는다', async () => {
    const { auth } = service(false);
    await expect(auth.refresh('refresh-0', operationId)).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });
});

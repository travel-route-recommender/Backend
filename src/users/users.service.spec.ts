import { RefreshReceipt } from '../schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService refresh rotation', () => {
  it('Mongoose update pipeline을 명시적으로 활성화한다', async () => {
    let capturedUpdate: unknown;
    let capturedOptions: unknown;
    const userModel = {
      findOneAndUpdate: (
        _filter: unknown,
        update: unknown,
        options: unknown,
      ) => {
        capturedUpdate = update;
        capturedOptions = options;
        return { exec: () => Promise.resolve(null) };
      },
    };
    const service = new UsersService(userModel as never);
    const receipt: RefreshReceipt = {
      operationId: '8fb9d9a8-71c3-42fc-9690-c18e274f3122',
      requestTokenHash: 'request-token-hash',
      accessToken: 'access-token',
      refreshToken: 'next-refresh-token',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await service.rotateRefreshToken(
      'user-id',
      'current-refresh-token',
      receipt.refreshToken,
      receipt,
    );

    expect(Array.isArray(capturedUpdate)).toBe(true);
    expect(capturedOptions).toEqual({
      returnDocument: 'after',
      updatePipeline: true,
    });
  });

  it('로그아웃 시 현재 토큰뿐 아니라 그 토큰으로 발급된 재시도 receipt도 폐기한다', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const service = new UsersService({ updateOne } as never);
    const refreshToken = 'refresh-token-before-rotation';

    await service.revokeRefreshToken('user-id', refreshToken);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'user-id' },
      {
        $pull: {
          refreshTokens: refreshToken,
          refreshReceipts: {
            $or: [
              { refreshToken },
              { requestTokenHash: service.refreshTokenHash(refreshToken) },
            ],
          },
        },
      },
    );
  });
});

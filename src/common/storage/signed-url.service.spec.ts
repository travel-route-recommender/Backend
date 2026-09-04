import { SignedUrlService } from './signed-url.service';

describe('SignedUrlService token validation', () => {
  function service() {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'UPLOAD_SIGNING_SECRET') return 'test-signing-secret';
        if (key === 'APP_BASE_URL') return 'http://localhost:3000';
        return fallback;
      }),
    };
    const uploads = { getUploadRoot: jest.fn(() => 'C:\\test-uploads') };
    return new SignedUrlService(config as never, uploads as never);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('서명 뒤 추가 토큰 조각이 붙으면 거부한다', () => {
    const signed = service().createDownloadUrl({
      publicPath: '/uploads/tickets/room-1/ticket.png',
      roomId: 'room-1',
    });

    try {
      service().verifyToken(`${signed.token}.unexpected`);
      throw new Error('검증 실패가 발생해야 합니다.');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        response: { code: 'INVALID_DOWNLOAD_TOKEN' },
      });
    }
  });

  it.each([undefined, '', ['duplicate', 'query'], 'x'.repeat(4097)])(
    '누락·중복·과도한 token 쿼리를 500 없이 거부한다: %p',
    (token) => {
      try {
        service().verifyToken(token);
        throw new Error('검증 실패가 발생해야 합니다.');
      } catch (error: unknown) {
        expect(error).toMatchObject({
          response: { code: 'INVALID_DOWNLOAD_TOKEN' },
        });
      }
    },
  );

  it('만료 시각 경계부터 토큰을 거부한다', () => {
    const now = Date.parse('2026-08-19T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const instance = service();
    const signed = instance.createDownloadUrl({
      publicPath: '/uploads/documents/room-1/file.pdf',
      roomId: 'room-1',
      ttlSec: 60,
    });
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);

    try {
      instance.verifyToken(signed.token);
      throw new Error('검증 실패가 발생해야 합니다.');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        response: { code: 'DOWNLOAD_TOKEN_EXPIRED' },
      });
    }
  });
});

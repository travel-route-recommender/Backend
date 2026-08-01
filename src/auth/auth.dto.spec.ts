import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { RefreshTokenDto, SocialLoginDto } from './dto/auth.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const device = {
  installationId: 'installation-id-0000001',
  platform: 'ios',
};

describe('auth DTO validation hardening', () => {
  it('rejects oversized refresh tokens', async () => {
    await expect(
      pipe.transform(
        {
          ...device,
          refreshToken: 'x'.repeat(50_000),
          requestId: '00000000-0000-4000-8000-000000000000',
        },
        { type: 'body', metatype: RefreshTokenDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects oversized social login fields', async () => {
    await expect(
      pipe.transform(
        {
          ...device,
          idToken: 'x'.repeat(50_000),
          challengeId: 'c'.repeat(50_000),
        },
        { type: 'body', metatype: SocialLoginDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

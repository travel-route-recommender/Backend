import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CURRENT_TERMS_VERSION = '1.0';
export const CURRENT_PRIVACY_CONSENT_VERSION = '1.0';

class RequiredLegalAgreementsDto {
  @ApiProperty({
    example: CURRENT_TERMS_VERSION,
    enum: [CURRENT_TERMS_VERSION],
  })
  @IsString()
  @MaxLength(20)
  @Equals(CURRENT_TERMS_VERSION)
  termsVersion: string;

  @ApiProperty({
    example: CURRENT_PRIVACY_CONSENT_VERSION,
    enum: [CURRENT_PRIVACY_CONSENT_VERSION],
  })
  @IsString()
  @MaxLength(20)
  @Equals(CURRENT_PRIVACY_CONSENT_VERSION)
  privacyConsentVersion: string;

  @ApiProperty({ example: true, description: '만 14세 이상 본인 확인' })
  @Equals(true)
  overFourteenConfirmed: true;
}

export class LoginDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

export class SignupDto extends RequiredLegalAgreementsDto {
  @ApiProperty({ example: '윤지', minLength: 2 })
  @IsString()
  @MinLength(2)
  nickname: string;

  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secure-password', minLength: 12 })
  @IsString()
  @MinLength(12)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'POST /auth/login 또는 /auth/signup 응답의 refreshToken',
  })
  @IsString()
  refreshToken: string;
}

export class JoinByInviteDto extends RequiredLegalAgreementsDto {
  @ApiProperty({ example: 'ABCD1234', description: '여행방 초대 코드 (8자)' })
  @IsString()
  inviteCode: string;

  @ApiProperty({ example: '게스트윤지', minLength: 2 })
  @IsString()
  @MinLength(2)
  nickname: string;
}

export class KakaoOAuthDto {
  @ApiProperty({
    example: 'kakao_access_token_from_sdk',
    description: 'Kakao SDK에서 발급받은 access token',
  })
  @IsString()
  accessToken: string;
}

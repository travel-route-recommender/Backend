import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DeviceMetadataDto {
  @ApiProperty({
    description: '앱 설치 시 생성해 보안 저장소에 보관한 랜덤 ID',
  })
  @IsString()
  @Length(16, 128)
  installationId: string;

  @ApiProperty({ enum: ['android', 'ios', 'web', 'unknown'] })
  @IsIn(['android', 'ios', 'web', 'unknown'])
  platform: 'android' | 'ios' | 'web' | 'unknown';

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}

export class LoginDto extends DeviceMetadataDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class SignupDto extends DeviceMetadataDto {
  @ApiProperty({ example: '윤지', minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nickname: string;

  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'correct horse battery staple', minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto extends DeviceMetadataDto {
  @ApiProperty({ description: '로그인 또는 직전 갱신에서 받은 Refresh Token' })
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ description: 'Idempotency-Key 헤더 대신 사용 가능' })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: '이전 클라이언트와의 호환용; sid로 폐기함',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutWithRefreshTokenDto {
  @ApiProperty({ description: '폐기할 모바일 Refresh Token' })
  @IsString()
  @MinLength(32)
  refreshToken: string;
}

export class DeleteAccountDto {
  @ApiProperty({
    example: 'DELETE',
    description: '실수로 인한 탈퇴를 방지하는 고정 확인 값',
  })
  @IsIn(['DELETE'])
  confirmation: 'DELETE';

  @ApiPropertyOptional({
    description: '비밀번호 로그인 계정은 현재 비밀번호 필수',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class JoinByInviteDto extends DeviceMetadataDto {
  @ApiProperty({ example: 'ABCD1234', description: '여행방 초대 코드' })
  @IsString()
  @Length(6, 32)
  inviteCode: string;

  @ApiProperty({ example: '게스트윤지', minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nickname: string;
}

export class MobileInvitePreviewQueryDto extends DeviceMetadataDto {}

export class SocialChallengeDto {
  @ApiProperty({ enum: ['google', 'kakao'] })
  @IsIn(['google', 'kakao'])
  provider: 'google' | 'kakao';

  @ApiProperty()
  @IsString()
  @Length(16, 128)
  installationId: string;
}

export class SocialLoginDto extends DeviceMetadataDto {
  @ApiProperty({ description: 'Provider가 발급한 OIDC ID Token' })
  @IsString()
  idToken: string;

  @ApiProperty({ description: '/auth/social/challenge에서 받은 ID' })
  @IsString()
  challengeId: string;
}

export class KakaoAuthorizationCodeDto extends DeviceMetadataDto {
  @ApiProperty({ description: 'Kakao가 Redirect URI로 전달한 인가 코드' })
  @IsString()
  @Length(8, 2048)
  code: string;

  @ApiProperty({ description: '/auth/social/challenge에서 받은 ID' })
  @IsString()
  @Length(16, 128)
  challengeId: string;

  @ApiProperty({ description: 'Kakao Redirect에서 돌려받은 OAuth state' })
  @IsString()
  @Length(16, 128)
  state: string;

  @ApiProperty({ description: 'PKCE code_verifier' })
  @IsString()
  @Length(43, 128)
  codeVerifier: string;

  @ApiProperty({ description: 'Kakao Developers에 등록된 Redirect URI' })
  @IsUrl({
    protocols: ['http', 'https', 'tripmatch'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  redirectUri: string;
}

export class GuestPasswordUpgradeDto extends DeviceMetadataDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

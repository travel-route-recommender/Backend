import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TermsFieldsDto {
  @ApiProperty({ example: '1.0' })
  @IsString()
  @MinLength(1)
  termsVersion: string;

  @ApiProperty({ example: '1.0' })
  @IsString()
  @MinLength(1)
  privacyConsentVersion: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  overFourteenConfirmed: boolean;
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

export class SignupDto extends TermsFieldsDto {
  @ApiProperty({ example: '윤지', minLength: 2 })
  @IsString()
  @MinLength(2)
  nickname: string;

  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
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

export class JoinByInviteDto extends TermsFieldsDto {
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
    description: '카카오 SDK access token. 신규 가입 시 약관 3개 필수.',
  })
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ example: '1.0', description: '신규 가입 시 필수' })
  @IsOptional()
  @IsString()
  termsVersion?: string;

  @ApiPropertyOptional({ example: '1.0', description: '신규 가입 시 필수' })
  @IsOptional()
  @IsString()
  privacyConsentVersion?: string;

  @ApiPropertyOptional({ example: true, description: '신규 가입 시 true 필수' })
  @IsOptional()
  @IsBoolean()
  overFourteenConfirmed?: boolean;
}

export class AppleFullNameDto {
  @ApiPropertyOptional({ example: '지' })
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiPropertyOptional({ example: '윤' })
  @IsOptional()
  @IsString()
  familyName?: string;
}

export class AppleOAuthDto {
  @ApiProperty({ description: 'Apple identityToken (JWT)' })
  @IsString()
  identityToken: string;

  @ApiProperty({ description: 'Apple authorization code' })
  @IsString()
  authorizationCode: string;

  @ApiPropertyOptional({ description: 'Apple nonce. 보냈으면 검증함' })
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiPropertyOptional({
    type: AppleFullNameDto,
    description: '최초 1회만 Apple이 주는 이름',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleFullNameDto)
  fullName?: AppleFullNameDto;

  @ApiPropertyOptional({ example: '1.0', description: '신규 가입 시 필수' })
  @IsOptional()
  @IsString()
  termsVersion?: string;

  @ApiPropertyOptional({ example: '1.0', description: '신규 가입 시 필수' })
  @IsOptional()
  @IsString()
  privacyConsentVersion?: string;

  @ApiPropertyOptional({ example: true, description: '신규 가입 시 true 필수' })
  @IsOptional()
  @IsBoolean()
  overFourteenConfirmed?: boolean;
}

export class DeleteMeDto {
  @ApiPropertyOptional({
    description: '이메일 계정만 필수. 게스트·소셜은 생략',
  })
  @IsOptional()
  @IsString()
  password?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'test@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}

export class SignupDto {
  @ApiProperty({ example: '윤지', minLength: 2 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(12)
  nickname: string;

  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password1234', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenBodyDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'POST /auth/login 또는 /auth/signup 응답의 refreshToken',
  })
  @IsString()
  @MaxLength(8192)
  refreshToken: string;
}

export class RefreshTokenDto extends RefreshTokenBodyDto {
  @ApiProperty({
    example: '8fb9d9a8-71c3-42fc-9690-c18e274f3122',
    format: 'uuid',
    description:
      '같은 갱신 요청의 재시도에 유지하는 UUID. 응답 유실 복구와 일회성 토큰 회전을 함께 보장합니다.',
  })
  @IsUUID()
  operationId: string;
}

export class JoinByInviteDto {
  @ApiProperty({ example: 'ABCD1234', description: '여행방 초대 코드 (8자)' })
  @IsString()
  @MaxLength(64)
  inviteCode: string;

  @ApiProperty({ example: '게스트윤지', minLength: 2 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(12)
  nickname: string;
}

export class KakaoOAuthDto {
  @ApiProperty({
    example: 'kakao_access_token_from_sdk',
    description: 'Kakao SDK에서 발급받은 access token',
  })
  @IsString()
  @MaxLength(8192)
  accessToken: string;
}

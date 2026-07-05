import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

export class SignupDto {
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

export class JoinByInviteDto {
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

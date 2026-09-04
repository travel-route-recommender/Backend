import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: '이메일·비밀번호 계정은 현재 비밀번호가 필수입니다.',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

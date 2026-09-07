import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  AppleOAuthDto,
  JoinByInviteDto,
  KakaoOAuthDto,
  LoginDto,
  RefreshTokenDto,
  SignupDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  AuthJoinByInviteDto,
  AuthTokensDto,
  SuccessDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({
    summary: '이메일 회원가입',
    description:
      '약관 3개 필수. accessToken · refreshToken · user 반환. 이후 `/onboarding`을 이어가세요.',
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: '이메일 로그인',
    description:
      'accessToken · refreshToken · user 반환. Swagger Authorize에 accessToken을 넣으면 됩니다.',
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({
    summary: '액세스 토큰 갱신',
    description: 'refreshToken으로 새 accessToken을 발급받습니다.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({
    summary: '로그아웃',
    description: '해당 refreshToken을 폐기합니다.',
  })
  @ApiOkResponse({ type: SuccessDto })
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Post('join-by-invite')
  @ApiOperation({
    summary: '초대코드로 게스트 입장',
    description:
      '게스트 유저 생성 후 여행방 입장. 약관 3개 필수.',
  })
  @ApiCreatedResponse({ type: AuthJoinByInviteDto })
  joinByInvite(@Body() dto: JoinByInviteDto) {
    return this.authService.joinByInvite(dto);
  }

  @Post('oauth/kakao')
  @ApiOperation({
    summary: '카카오 로그인',
    description:
      '카카오 accessToken 교환. 신규 가입이면 약관 3개 필수. 기존 이메일 계정과 자동 병합하지 않음.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  kakao(@Body() dto: KakaoOAuthDto) {
    return this.authService.kakaoLogin(dto);
  }

  @Post('oauth/apple')
  @ApiOperation({
    summary: 'Apple 로그인',
    description:
      'identityToken 검증 + authorization code 교환. 신규 가입 시 약관 3개 필수. 이메일 계정과 자동 병합하지 않음.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  apple(@Body() dto: AppleOAuthDto) {
    return this.authService.appleLogin(dto);
  }
}

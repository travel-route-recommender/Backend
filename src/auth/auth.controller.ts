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
      'accessToken · refreshToken · user를 반환합니다. 이후 온보딩 설문(`/onboarding`)을 이어가세요.',
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
      '계정이 없는 친구가 초대 링크로 들어올 때 사용. 게스트 유저를 만들고 해당 여행방에 바로 입장시킵니다.',
  })
  @ApiCreatedResponse({ type: AuthJoinByInviteDto })
  joinByInvite(@Body() dto: JoinByInviteDto) {
    return this.authService.joinByInvite(dto.inviteCode, dto.nickname);
  }

  @Post('oauth/kakao')
  @ApiOperation({
    summary: '카카오 로그인',
    description:
      '카카오 SDK에서 받은 accessToken을 넘기면 Tourmate 토큰으로 교환합니다.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  kakao(@Body() dto: KakaoOAuthDto) {
    return this.authService.kakaoLogin(dto.accessToken);
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: '이메일 회원가입' })
  @ApiCreatedResponse({
    description: 'accessToken, refreshToken, user 반환',
  })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: '이메일 로그인' })
  @ApiCreatedResponse({
    description: 'accessToken, refreshToken, user 반환',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'refresh token으로 access token 갱신' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: '로그아웃 (refresh token 폐기)' })
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Post('join-by-invite')
  @ApiOperation({ summary: '초대코드로 guest 계정 생성 후 room 입장' })
  joinByInvite(@Body() dto: JoinByInviteDto) {
    return this.authService.joinByInvite(dto.inviteCode, dto.nickname);
  }

  @Post('oauth/kakao')
  @ApiOperation({ summary: 'Kakao OAuth 로그인' })
  kakao(@Body() dto: KakaoOAuthDto) {
    return this.authService.kakaoLogin(dto.accessToken);
  }
}

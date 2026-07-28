import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import {
  DeleteAccountDto,
  GuestPasswordUpgradeDto,
  JoinByInviteDto,
  KakaoAuthorizationCodeDto,
  LoginDto,
  LogoutWithRefreshTokenDto,
  MobileInvitePreviewQueryDto,
  RefreshTokenDto,
  SignupDto,
  SocialChallengeDto,
  SocialLoginDto,
} from './dto/auth.dto';
import { RequestContextService } from './request-context.service';
import { TokenService } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly requestContext: RequestContextService,
    private readonly tokens: TokenService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: '이메일 회원가입' })
  signup(@Body() dto: SignupDto, @Req() request: Request) {
    return this.auth.signup(dto, this.requestContext.fromRequest(request, dto));
  }

  @Post('login')
  @ApiOperation({ summary: '이메일 로그인' })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, this.requestContext.fromRequest(request, dto));
  }

  @Post('refresh')
  @ApiOperation({ summary: '일회성 Refresh Token Rotation' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID. 재시도 시 반드시 같은 값을 다시 전송',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('idempotency-key') headerRequestId: string | undefined,
  ) {
    const operationId = this.refreshOperationId(headerRequestId, dto.requestId);
    return this.auth.refresh(dto.refreshToken, operationId);
  }

  @Post('logout-by-refresh')
  @ApiOperation({ summary: '모바일 Refresh Token 기준 현재 세션 폐기' })
  logoutByRefresh(@Body() dto: LogoutWithRefreshTokenDto) {
    return this.auth.logoutWithRefreshToken(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: '현재 기기 세션 폐기' })
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user.sessionId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @ApiOperation({ summary: '모바일 회원 탈퇴 및 모든 세션 폐기' })
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(user.userId, dto);
  }

  @Post('join-by-invite')
  @ApiOperation({ summary: '설치 ID에 묶인 제한된 guest로 초대방 입장' })
  joinByInvite(@Body() dto: JoinByInviteDto, @Req() request: Request) {
    return this.auth.joinByInvite(
      dto,
      this.requestContext.fromRequest(request, dto),
    );
  }

  @Get('invites/:inviteCode/preview')
  @ApiOperation({ summary: '모바일 게스트 참여 전 초대코드 검증' })
  @ApiParam({ name: 'inviteCode', example: 'ABCD1234' })
  invitePreview(
    @Param('inviteCode') inviteCode: string,
    @Query() query: MobileInvitePreviewQueryDto,
    @Req() request: Request,
  ) {
    return this.auth.previewInvite(
      inviteCode,
      this.requestContext.fromRequest(request, query),
    );
  }

  @Post('social/challenge')
  @ApiOperation({ summary: 'Google/Kakao OIDC nonce 발급' })
  socialChallenge(@Body() dto: SocialChallengeDto) {
    return this.auth.createSocialChallenge(dto.provider, dto.installationId);
  }

  @Post('social/:provider')
  @ApiOperation({ summary: '검증된 Google/Kakao ID Token 로그인' })
  socialLogin(
    @Param('provider') provider: string,
    @Body() dto: SocialLoginDto,
    @Req() request: Request,
  ) {
    const validatedProvider = this.socialProvider(provider);
    return this.auth.socialLogin(
      validatedProvider,
      dto,
      this.requestContext.fromRequest(request, dto),
    );
  }

  @Post('social/kakao/code')
  @ApiOperation({
    summary: 'Kakao Authorization Code로 모바일 가입 또는 로그인',
  })
  mobileKakaoLogin(
    @Body() dto: KakaoAuthorizationCodeDto,
    @Req() request: Request,
  ) {
    return this.auth.socialLoginWithKakaoAuthorizationCode(
      dto,
      this.requestContext.fromRequest(request, dto),
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('identities/link/:provider')
  @ApiOperation({ summary: '현재 계정에 Google/Kakao 로그인 수단 연결' })
  linkIdentity(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
    @Body() dto: SocialLoginDto,
    @Req() request: Request,
  ) {
    return this.auth.linkSocialIdentity(
      user.userId,
      user.sessionId,
      this.socialProvider(provider),
      dto,
      this.requestContext.fromRequest(request, dto),
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('guest/upgrade/password')
  @ApiOperation({ summary: '게스트 데이터를 유지하며 이메일 회원으로 전환' })
  upgradeGuest(
    @CurrentUser() user: AuthUser,
    @Body() dto: GuestPasswordUpgradeDto,
    @Req() request: Request,
  ) {
    return this.auth.upgradeGuestWithPassword(
      user.userId,
      user.sessionId,
      dto,
      this.requestContext.fromRequest(request, dto),
    );
  }

  @Get('.well-known/jwks.json')
  @ApiOperation({ summary: 'Access Token 검증 공개키' })
  jwks() {
    return this.tokens.getJwks();
  }

  private socialProvider(provider: string): 'google' | 'kakao' {
    if (provider !== 'google' && provider !== 'kakao') {
      throw new BadRequestException('Unsupported social provider');
    }
    return provider;
  }

  private refreshOperationId(
    headerRequestId: string | undefined,
    bodyRequestId: string | undefined,
  ): string {
    const operationId = headerRequestId ?? bodyRequestId;
    if (!operationId || !isUUID(operationId)) {
      throw new BadRequestException(
        'A UUID Idempotency-Key header or requestId is required',
      );
    }
    return operationId;
  }
}

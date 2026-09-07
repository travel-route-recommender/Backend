import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { UsersService } from '../users/users.service';
import {
  AppleOAuthDto,
  JoinByInviteDto,
  KakaoOAuthDto,
  LoginDto,
  SignupDto,
} from './dto/auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import { AppleService } from './apple.service';
import { requireTermsConsent, termsToUserFields } from './terms';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly appleService: AppleService,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const terms = requireTermsConsent(dto);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      nickname: dto.nickname,
      onboardingCompleted: false,
      isGuest: false,
      ...termsToUserFields(terms),
    });

    return this.issueTokens(user._id.toString(), user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string; email?: string }>(
        refreshToken,
        { secret: this.config.get('JWT_REFRESH_SECRET', 'change-me-refresh-secret') },
      );

      const user = await this.usersService.findById(payload.sub);
      if (
        !user ||
        user.deletedAt ||
        !user.refreshTokens.includes(refreshToken)
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.issueTokens(user._id.toString(), user.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return { success: true };

    await this.usersService.updateById(userId, {
      refreshTokens: user.refreshTokens.filter((t) => t !== refreshToken),
    });
    return { success: true };
  }

  async joinByInvite(dto: JoinByInviteDto) {
    const terms = requireTermsConsent(dto);
    const room = await this.roomModel.findOne({ inviteCode: dto.inviteCode });
    if (!room) {
      throw new UnauthorizedException('Invalid invite code');
    }
    if (room.status === 'closed') {
      throw new UnauthorizedException('닫힌 여행방입니다');
    }

    const user = await this.usersService.create({
      nickname: dto.nickname,
      isGuest: true,
      onboardingCompleted: false,
      ...termsToUserFields(terms),
    });

    room.members.push({
      userId: user._id,
      role: 'member',
      joinedAt: new Date(),
      mobilityConstraints: {
        values: [],
        status: 'missing',
        source: 'user',
        version: 1,
        updatedAt: new Date(),
      },
    });
    room.factsVersion = (room.factsVersion ?? 0) + 1;
    await room.save();

    const tokens = await this.issueTokens(user._id.toString());
    return {
      ...tokens,
      roomId: room._id.toString(),
    };
  }

  async kakaoLogin(dto: KakaoOAuthDto) {
    const { data } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${dto.accessToken}` },
    });

    const oauthId = String(data.id);
    const kakaoAccount = data.kakao_account ?? {};
    const profile = kakaoAccount.profile ?? {};
    const email = kakaoAccount.email as string | undefined;
    const nickname =
      (profile.nickname as string | undefined) ?? `kakao_${oauthId.slice(-6)}`;

    let user = await this.usersService.findByOAuth('kakao', oauthId);
    if (!user && email) {
      // 기존 이메일 계정과 자동 병합하지 않음. 카카오 sub만 조회.
    }

    if (!user) {
      const terms = requireTermsConsent(dto);
      const emailTaken = email
        ? await this.usersService.findByEmail(email)
        : null;
      user = await this.usersService.create({
        email: email && !emailTaken ? email : undefined,
        oauthProvider: 'kakao',
        oauthId,
        nickname,
        profileImageUrl: profile.profile_image_url,
        isGuest: false,
        onboardingCompleted: false,
        ...termsToUserFields(terms),
      });
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Deleted account');
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  async appleLogin(dto: AppleOAuthDto) {
    const identity = await this.appleService.verifyIdentityToken(
      dto.identityToken,
      dto.nonce,
    );
    const tokens = await this.appleService.exchangeAuthorizationCode(
      dto.authorizationCode,
    );

    let user = await this.usersService.findByOAuth('apple', identity.sub);

    if (!user) {
      const terms = requireTermsConsent(dto);
      const given = dto.fullName?.givenName?.trim();
      const family = dto.fullName?.familyName?.trim();
      const nickname =
        [family, given].filter(Boolean).join('') ||
        `apple_${identity.sub.slice(-6)}`;

      const email = identity.email;
      const emailTaken = email
        ? await this.usersService.findByEmail(email)
        : null;

      user = await this.usersService.create({
        email: email && !emailTaken ? email : undefined,
        oauthProvider: 'apple',
        oauthId: identity.sub,
        nickname,
        isGuest: false,
        onboardingCompleted: false,
        appleRefreshTokenEnc: tokens.refreshToken
          ? this.appleService.encryptRefreshToken(tokens.refreshToken)
          : undefined,
        ...termsToUserFields(terms),
      });
    } else if (tokens.refreshToken) {
      await this.usersService.updateById(user._id.toString(), {
        appleRefreshTokenEnc: this.appleService.encryptRefreshToken(
          tokens.refreshToken,
        ),
      });
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Deleted account');
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  private async issueTokens(userId: string, email?: string) {
    const payload = { sub: userId, email };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', 'change-me-access-secret'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'change-me-refresh-secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const user = await this.usersService.findById(userId);
    if (user) {
      const tokens = [...user.refreshTokens, refreshToken].slice(-5);
      await this.usersService.updateById(userId, { refreshTokens: tokens });
    }

    return {
      accessToken,
      refreshToken,
      user: user ? this.usersService.toPublicUser(user) : { id: userId },
    };
  }
}

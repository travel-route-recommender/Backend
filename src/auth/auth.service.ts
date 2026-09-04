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
import { JoinByInviteDto, LoginDto, SignupDto } from './dto/auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';

interface KakaoUserResponse {
  id: string | number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const agreedAt = new Date();
    const user = await this.usersService.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      nickname: dto.nickname,
      onboardingCompleted: false,
      isGuest: false,
      legalAgreements: {
        termsVersion: dto.termsVersion,
        termsAgreedAt: agreedAt,
        privacyConsentVersion: dto.privacyConsentVersion,
        privacyConsentAgreedAt: agreedAt,
        overFourteenConfirmedAt: agreedAt,
      },
    });

    return this.issueTokens(user._id.toString(), user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash) {
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
        {
          secret: this.config.get(
            'JWT_REFRESH_SECRET',
            'change-me-refresh-secret',
          ),
        },
      );

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.refreshTokens.includes(refreshToken)) {
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
    const room = await this.roomModel.findOne({ inviteCode: dto.inviteCode });
    if (!room) {
      throw new UnauthorizedException('Invalid invite code');
    }

    const agreedAt = new Date();
    const user = await this.usersService.create({
      nickname: dto.nickname,
      isGuest: true,
      onboardingCompleted: false,
      legalAgreements: {
        termsVersion: dto.termsVersion,
        termsAgreedAt: agreedAt,
        privacyConsentVersion: dto.privacyConsentVersion,
        privacyConsentAgreedAt: agreedAt,
        overFourteenConfirmedAt: agreedAt,
      },
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

  async kakaoLogin(accessToken: string) {
    const { data } = await axios.get<KakaoUserResponse>(
      'https://kapi.kakao.com/v2/user/me',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const oauthId = String(data.id);
    const kakaoAccount = data.kakao_account ?? {};
    const profile = kakaoAccount.profile ?? {};
    const email = kakaoAccount.email;
    const nickname = profile.nickname ?? `kakao_${oauthId.slice(-6)}`;

    let user = email ? await this.usersService.findByEmail(email) : null;
    if (!user) {
      user = await this.usersService.findByOAuth('kakao', oauthId);
    }

    if (!user) {
      user = await this.usersService.create({
        email,
        oauthProvider: 'kakao',
        oauthId,
        nickname,
        profileImageUrl: profile.profile_image_url,
        isGuest: false,
        onboardingCompleted: false,
      });
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

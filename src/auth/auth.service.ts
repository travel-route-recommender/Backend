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
import { LoginDto, SignupDto } from './dto/auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';

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
    const user = await this.usersService.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      nickname: dto.nickname,
      onboardingCompleted: false,
      isGuest: false,
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
        { secret: this.config.get('JWT_REFRESH_SECRET', 'change-me-refresh-secret') },
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

  async joinByInvite(inviteCode: string, nickname: string) {
    const room = await this.roomModel.findOne({ inviteCode });
    if (!room) {
      throw new UnauthorizedException('Invalid invite code');
    }

    const user = await this.usersService.create({
      nickname,
      isGuest: true,
      onboardingCompleted: false,
    });

    room.members.push({
      userId: user._id,
      role: 'member',
      joinedAt: new Date(),
    });
    await room.save();

    return {
      ...this.issueTokens(user._id.toString()),
      roomId: room._id.toString(),
    };
  }

  async kakaoLogin(accessToken: string) {
    const { data } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const oauthId = String(data.id);
    const kakaoAccount = data.kakao_account ?? {};
    const profile = kakaoAccount.profile ?? {};
    const email = kakaoAccount.email as string | undefined;
    const nickname =
      (profile.nickname as string | undefined) ?? `kakao_${oauthId.slice(-6)}`;

    let user = email
      ? await this.usersService.findByEmail(email)
      : null;
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

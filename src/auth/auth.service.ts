import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { UsersService } from '../users/users.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';

const MAX_ROOM_MEMBERS = 64;
const REFRESH_REPLAY_WINDOW_MS = 90_000;

type KakaoUserResponse = {
  id?: string | number;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
};

function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
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
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: '이미 가입된 이메일입니다.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user;
    try {
      user = await this.usersService.create({
        email,
        passwordHash,
        nickname: dto.nickname.trim(),
        onboardingCompleted: false,
        isGuest: false,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: '이미 가입된 이메일입니다.',
        });
      }
      throw error;
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  async refresh(refreshToken: string, operationId: string) {
    let payload: { sub: string; email?: string; typ?: string };
    try {
      payload = this.jwtService.verify<{
        sub: string;
        email?: string;
        typ?: string;
      }>(refreshToken, {
        secret: this.config.get(
          'JWT_REFRESH_SECRET',
          'change-me-refresh-secret',
        ),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
      });
    }
    if (payload.typ && payload.typ !== 'refresh') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
      });
    }

    const requestTokenHash = this.usersService.refreshTokenHash(refreshToken);
    const replay = await this.usersService.findRefreshReceipt(
      payload.sub,
      operationId,
      requestTokenHash,
    );
    if (replay) {
      return {
        accessToken: replay.receipt.accessToken,
        refreshToken: replay.receipt.refreshToken,
        user: this.usersService.toPublicUser(replay.user),
      };
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
      });
    }

    const tokens = this.createTokenPair(user._id.toString(), user.email);
    const rotated = await this.usersService.rotateRefreshToken(
      user._id.toString(),
      refreshToken,
      tokens.refreshToken,
      {
        operationId,
        requestTokenHash,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_REPLAY_WINDOW_MS),
      },
    );
    if (rotated) {
      return { ...tokens, user: this.usersService.toPublicUser(rotated) };
    }

    // A concurrent retry with the same operation may have committed first.
    const committedReplay = await this.usersService.findRefreshReceipt(
      payload.sub,
      operationId,
      requestTokenHash,
    );
    if (committedReplay) {
      return {
        accessToken: committedReplay.receipt.accessToken,
        refreshToken: committedReplay.receipt.refreshToken,
        user: this.usersService.toPublicUser(committedReplay.user),
      };
    }
    throw new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
    });
  }

  async logout(userId: string, refreshToken: string) {
    await this.usersService.revokeRefreshToken(userId, refreshToken);
    return { success: true };
  }

  async joinByInvite(inviteCode: string, nickname: string) {
    const normalizedCode = normalizeInviteCode(inviteCode);
    const room = await this.roomModel.findOne({ inviteCode: normalizedCode });
    if (!room) {
      throw new UnauthorizedException({
        code: 'INVALID_INVITE_CODE',
        message: '유효하지 않은 초대 코드입니다.',
      });
    }
    if (room.status !== 'ongoing') {
      throw new ConflictException({
        code: 'ROOM_NOT_ONGOING',
        message: '이미 종료된 여행방에는 참여할 수 없습니다.',
      });
    }
    if (room.members.length >= MAX_ROOM_MEMBERS) {
      throw new ConflictException({
        code: 'ROOM_FULL',
        message: '여행방 참여 인원이 가득 찼습니다.',
      });
    }

    const user = await this.usersService.create({
      nickname: nickname.trim(),
      isGuest: true,
      onboardingCompleted: false,
    });
    try {
      const joined = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          status: 'ongoing',
          $expr: { $lt: [{ $size: '$members' }, MAX_ROOM_MEMBERS] },
        },
        {
          $push: {
            members: {
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
            },
          },
          $inc: { factsVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!joined) {
        throw new ConflictException({
          code: 'ROOM_FULL',
          message: '여행방 참여 상태가 변경되었습니다. 다시 확인해 주세요.',
        });
      }
    } catch (error) {
      await this.usersService.deleteById(user._id.toString());
      throw error;
    }

    const tokens = await this.issueTokens(user._id.toString());
    return {
      ...tokens,
      roomId: room._id.toString(),
    };
  }

  async kakaoLogin(accessToken: string) {
    let data: KakaoUserResponse;
    try {
      const response = await axios.get<KakaoUserResponse>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 8_000,
        },
      );
      data = response.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 401 || status === 403) {
        throw new UnauthorizedException({
          code: 'KAKAO_TOKEN_INVALID',
          message: '카카오 로그인 정보가 만료되었거나 유효하지 않습니다.',
        });
      }
      throw new ServiceUnavailableException({
        code: 'KAKAO_AUTH_UNAVAILABLE',
        message:
          '카카오 로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    if (data.id == null) {
      throw new UnauthorizedException({
        code: 'KAKAO_PROFILE_INVALID',
        message: '카카오 사용자 정보를 확인할 수 없습니다.',
      });
    }
    const oauthId = String(data.id);
    const kakaoAccount = data.kakao_account ?? {};
    const profile = kakaoAccount.profile ?? {};
    const email =
      kakaoAccount.is_email_valid === true &&
      kakaoAccount.is_email_verified === true
        ? kakaoAccount.email?.trim().toLowerCase()
        : undefined;
    const nickname = profile.nickname?.trim() || `kakao_${oauthId.slice(-6)}`;

    let user = await this.usersService.findByOAuth('kakao', oauthId);

    if (!user && email) {
      const existingEmailUser = await this.usersService.findByEmail(email);
      if (existingEmailUser) {
        throw new ConflictException({
          code: 'ACCOUNT_LINK_REQUIRED',
          message:
            '같은 이메일의 기존 계정이 있습니다. 기존 로그인 방식을 이용해 주세요.',
        });
      }
    }

    if (!user) {
      try {
        user = await this.usersService.create({
          email,
          oauthProvider: 'kakao',
          oauthId,
          nickname,
          profileImageUrl: profile.profile_image_url,
          isGuest: false,
          onboardingCompleted: false,
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        user = await this.usersService.findByOAuth('kakao', oauthId);
        if (!user) {
          throw new ConflictException({
            code: 'ACCOUNT_ALREADY_EXISTS',
            message:
              '이미 등록된 계정입니다. 기존 로그인 방식을 이용해 주세요.',
          });
        }
      }
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  private createTokenPair(userId: string, email?: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, typ: 'access', jti: randomUUID() },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', 'change-me-access-secret'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, typ: 'refresh', jti: randomUUID() },
      {
        secret: this.config.get(
          'JWT_REFRESH_SECRET',
          'change-me-refresh-secret',
        ),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    return { accessToken, refreshToken };
  }

  private async issueTokens(userId: string, email?: string) {
    const tokens = this.createTokenPair(userId, email);
    const user = await this.usersService.appendRefreshToken(
      userId,
      tokens.refreshToken,
    );
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: '사용자 정보를 찾을 수 없습니다. 다시 로그인해 주세요.',
      });
    }

    return {
      ...tokens,
      user: this.usersService.toPublicUser(user),
    };
  }
}

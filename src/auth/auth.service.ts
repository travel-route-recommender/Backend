import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import { UserDocument } from '../schemas/user.schema';
import { UserSavesService } from '../users/user-saves.service';
import { UsersService } from '../users/users.service';
import {
  DeleteAccountDto,
  GuestPasswordUpgradeDto,
  JoinByInviteDto,
  KakaoAuthorizationCodeDto,
  LoginDto,
  SignupDto,
  SocialLoginDto,
} from './dto/auth.dto';
import { AuthCryptoService } from './auth-crypto.service';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenResponse, ClientContext } from './auth.types';
import { IdentityService } from './identity.service';
import { LoginProtectionService } from './login-protection.service';
import { OidcService, VerifiedSocialIdentity } from './oidc.service';
import { PasswordService } from './password.service';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(TravelRoom.name)
    private readonly roomModel: Model<TravelRoomDocument>,
    private readonly users: UsersService,
    private readonly identities: IdentityService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly loginProtection: LoginProtectionService,
    private readonly oidc: OidcService,
    private readonly crypto: AuthCryptoService,
    private readonly securityStore: SecurityStoreService,
    private readonly userSaves: UserSavesService,
  ) {}

  async signup(
    dto: SignupDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const email = this.crypto.normalizeEmail(dto.email);
    const [existingIdentity, existingUser] = await Promise.all([
      this.identities.findPasswordByEmail(email),
      this.users.findByEmail(email),
    ]);
    if (existingIdentity || existingUser) {
      throw new ConflictException('Email already registered');
    }

    this.passwords.assertPolicy(dto.password, email);
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.connection.transaction(async (mongoSession) => {
      const created = await this.users.create(
        {
          email,
          nickname: dto.nickname,
          onboardingCompleted: false,
          isGuest: false,
          accountType: 'member',
          status: 'active',
          securityVersion: 1,
        },
        mongoSession,
      );
      await this.identities.createPassword(
        created._id.toString(),
        email,
        passwordHash,
        mongoSession,
      );
      return created;
    });
    return this.sessions.createSession(user, context);
  }

  async login(
    dto: LoginDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const email = this.crypto.normalizeEmail(dto.email);
    await this.loginProtection.assertAllowed(email, context);

    const identity = await this.identities.findPasswordByEmail(email);
    const passwordHash = identity?.passwordHash;

    if (!identity || !passwordHash) {
      await this.passwords.consumeDummyVerification(dto.password);
      return this.failLogin(email, context);
    }

    let valid = false;
    try {
      valid = await this.passwords.verify(passwordHash, dto.password);
    } catch {
      valid = false;
    }
    if (!valid) await this.failLogin(email, context);

    const user = await this.users.findById(identity.userId.toString());
    if (!user) return this.failLogin(email, context);

    await this.loginProtection.recordSuccess(email, context);
    if (this.passwords.needsRehash(passwordHash)) {
      await this.identities.updatePasswordHash(
        identity._id.toString(),
        await this.passwords.hash(dto.password),
      );
    } else {
      await this.identities.touch(identity._id.toString());
    }

    return this.sessions.createSession(user, context);
  }

  refresh(
    refreshToken: string,
    operationId: string,
  ): Promise<AuthTokenResponse> {
    return this.sessions.refresh(refreshToken, operationId);
  }

  async logout(sessionId: string): Promise<{ success: true }> {
    await this.sessions.revokeCurrentSession(sessionId);
    return { success: true };
  }

  async logoutWithRefreshToken(
    refreshToken: string | undefined,
  ): Promise<{ success: true }> {
    if (refreshToken) {
      await this.sessions.revokeSessionByRefreshToken(refreshToken);
    }
    return { success: true };
  }

  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<{ success: true }> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account unavailable');
    }

    const passwordIdentity = await this.identities.findPasswordByUser(userId);
    if (passwordIdentity) {
      const passwordHash = passwordIdentity.passwordHash;
      if (!dto.password || !passwordHash) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const verified = await this.passwords
        .verify(passwordHash, dto.password)
        .catch(() => false);
      if (!verified) throw new UnauthorizedException('Invalid credentials');
    }

    await this.connection.transaction(async (mongoSession) => {
      await this.users.anonymizeDeletedAccount(userId, mongoSession);
      await this.identities.deleteForUser(userId, mongoSession);
      await this.userSaves.deleteAllForUser(userId, mongoSession);
    });

    await this.sessions.invalidateUserSecurityState(userId);
    await this.sessions.revokeAllUserSessions(userId, 'ACCOUNT_DELETED');
    return { success: true };
  }

  createSocialChallenge(provider: 'google' | 'kakao', installationId: string) {
    return this.oidc.createChallenge(provider, installationId);
  }

  async socialLogin(
    provider: 'google' | 'kakao',
    dto: SocialLoginDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const verified = await this.oidc.verify(
      provider,
      dto.idToken,
      dto.challengeId,
      dto.installationId,
    );
    return this.completeSocialLogin(verified, context);
  }

  async socialLoginWithKakaoAuthorizationCode(
    dto: KakaoAuthorizationCodeDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const verified = await this.oidc.verifyKakaoAuthorizationCode({
      code: dto.code,
      challengeId: dto.challengeId,
      state: dto.state,
      codeVerifier: dto.codeVerifier,
      redirectUri: dto.redirectUri,
      installationId: dto.installationId,
    });
    return this.completeSocialLogin(verified, context);
  }

  private async completeSocialLogin(
    verified: VerifiedSocialIdentity,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const provider = verified.provider;
    const identity = await this.identities.findSocial(
      provider,
      verified.issuer,
      verified.subject,
    );
    if (identity) {
      const existingUser = await this.users.findById(
        identity.userId.toString(),
      );
      if (!existingUser) throw new UnauthorizedException('Account unavailable');
      await this.identities.touch(identity._id.toString());
      return this.sessions.createSession(existingUser, context);
    }

    if (verified.email && verified.emailVerified) {
      const sameEmailUser = await this.users.findByEmail(verified.email);
      if (sameEmailUser) this.throwAccountLinkRequired(provider);
    }

    const user = await this.createSocialUser(verified);
    return this.sessions.createSession(user, context);
  }

  async linkSocialIdentity(
    userId: string,
    currentSessionId: string,
    provider: 'google' | 'kakao',
    dto: SocialLoginDto,
    context: ClientContext,
  ): Promise<{ linked: true } | AuthTokenResponse> {
    const verified = await this.oidc.verify(
      provider,
      dto.idToken,
      dto.challengeId,
      dto.installationId,
    );
    const [user, existingIdentity] = await Promise.all([
      this.users.findById(userId),
      this.identities.findSocial(provider, verified.issuer, verified.subject),
    ]);
    if (!user) throw new UnauthorizedException('Account unavailable');
    if (existingIdentity && existingIdentity.userId.toString() !== userId) {
      throw new ConflictException('Social identity belongs to another account');
    }
    if (existingIdentity) return { linked: true };

    if (verified.email && verified.emailVerified) {
      const emailOwner = await this.users.findByEmail(verified.email);
      if (emailOwner && emailOwner._id.toString() !== userId) {
        throw new ConflictException({
          code: 'ACCOUNT_MERGE_REQUIRED',
          message: 'Verified email belongs to another account',
        });
      }
    }

    const wasGuest = user.accountType === 'guest' || user.isGuest;
    const updated = await this.connection.transaction(async (mongoSession) => {
      await this.identities.createSocial(
        {
          userId,
          provider,
          issuer: verified.issuer,
          subject: verified.subject,
          email: verified.emailVerified ? verified.email : undefined,
          emailVerified: verified.emailVerified,
        },
        mongoSession,
      );
      if (!wasGuest) return user;
      return this.users.updateById(
        userId,
        {
          email:
            verified.emailVerified && verified.email
              ? verified.email
              : user.email,
          accountType: 'member',
          isGuest: false,
          guestExpiresAt: undefined,
          status: 'active',
        },
        mongoSession,
      );
    });

    if (!wasGuest) return { linked: true };
    if (!updated) throw new UnauthorizedException('Account unavailable');
    await this.sessions.revokeCurrentSession(
      currentSessionId,
      'GUEST_UPGRADED',
    );
    return this.sessions.createSession(updated, context);
  }

  async joinByInvite(
    dto: JoinByInviteDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse & { roomId: string }> {
    const inviteCode = this.normalizeInviteCode(dto.inviteCode);
    await this.assertGuestJoinRate(inviteCode, context);
    const room = await this.roomModel.findOne({
      inviteCode,
      status: 'ongoing',
    });
    if (!room) throw this.invalidInvite();

    const installationHash = this.crypto.hashIdentifier(
      `installation:${dto.installationId}`,
    );
    let user = await this.users.findGuestByInstallation(installationHash);
    if (!user) {
      user = await this.users.create({
        nickname: dto.nickname.trim(),
        isGuest: true,
        accountType: 'guest',
        status: 'active',
        securityVersion: 1,
        onboardingCompleted: false,
        guestInstallationHash: installationHash,
        guestExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      });
    }

    const otherRoom = await this.roomModel.findOne({
      _id: { $ne: room._id },
      'members.userId': user._id,
      status: 'ongoing',
    });
    if (otherRoom) {
      throw new ConflictException({
        code: 'GUEST_ROOM_LIMIT',
        message: 'Guest accounts can join one active room',
        details: { roomId: otherRoom._id.toString() },
      });
    }

    const refreshedGuest = await this.users.updateById(user._id.toString(), {
      nickname: dto.nickname.trim(),
      guestExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    });
    if (refreshedGuest) user = refreshedGuest;

    const alreadyMember = room.members.some(
      (member) => member.userId.toString() === user._id.toString(),
    );
    if (!alreadyMember) {
      room.members.push({
        userId: user._id,
        role: 'member',
        joinedAt: new Date(),
      });
      await room.save();
    }

    return {
      ...(await this.sessions.createSession(user, context)),
      roomId: room._id.toString(),
    };
  }

  async previewInvite(inviteCode: string, context: ClientContext) {
    await this.assertGuestPreviewRate(context);
    const normalizedCode = this.normalizeInviteCode(inviteCode);
    const room = await this.roomModel
      .findOne({ inviteCode: normalizedCode, status: 'ongoing' })
      .select('title destination startDate endDate members status')
      .exec();
    if (!room) throw this.invalidInvite();

    return {
      roomId: room._id.toString(),
      title: room.title,
      destination: room.destination?.name,
      startDate: room.startDate?.toISOString().slice(0, 10),
      endDate: room.endDate?.toISOString().slice(0, 10),
      memberCount: room.members.length,
    };
  }

  async upgradeGuestWithPassword(
    userId: string,
    currentSessionId: string,
    dto: GuestPasswordUpgradeDto,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const email = this.crypto.normalizeEmail(dto.email);
    const [user, emailOwner, passwordIdentity] = await Promise.all([
      this.users.findById(userId),
      this.users.findByEmail(email),
      this.identities.findPasswordByEmail(email),
    ]);
    if (!user || (user.accountType !== 'guest' && !user.isGuest)) {
      throw new ConflictException('Only guest accounts can be upgraded');
    }
    if (emailOwner || passwordIdentity) {
      throw new ConflictException('Email already registered');
    }

    this.passwords.assertPolicy(dto.password, email);
    const passwordHash = await this.passwords.hash(dto.password);
    const updated = await this.connection.transaction(async (mongoSession) => {
      await this.identities.createPassword(
        userId,
        email,
        passwordHash,
        mongoSession,
      );
      return this.users.updateById(
        userId,
        {
          email,
          isGuest: false,
          accountType: 'member',
          status: 'active',
          guestExpiresAt: undefined,
        },
        mongoSession,
      );
    });
    if (!updated) throw new UnauthorizedException('Account unavailable');
    await this.sessions.revokeCurrentSession(
      currentSessionId,
      'GUEST_UPGRADED',
    );
    return this.sessions.createSession(updated, context);
  }

  private async createSocialUser(
    verified: VerifiedSocialIdentity,
  ): Promise<UserDocument> {
    return this.connection.transaction(async (mongoSession) => {
      const user = await this.users.create(
        {
          email: verified.emailVerified ? verified.email : undefined,
          nickname:
            verified.nickname ??
            `${verified.provider}_${verified.subject.slice(-6)}`,
          profileImageUrl: verified.picture,
          isGuest: false,
          accountType: 'member',
          status: 'active',
          securityVersion: 1,
          onboardingCompleted: false,
        },
        mongoSession,
      );
      await this.identities.createSocial(
        {
          userId: user._id.toString(),
          provider: verified.provider,
          issuer: verified.issuer,
          subject: verified.subject,
          email: verified.email,
          emailVerified: verified.emailVerified,
        },
        mongoSession,
      );
      return user;
    });
  }

  private async failLogin(
    email: string,
    context: ClientContext,
  ): Promise<never> {
    await this.loginProtection.recordFailure(email, context);
    throw new UnauthorizedException('Invalid credentials');
  }

  private async assertGuestJoinRate(
    inviteCode: string,
    context: ClientContext,
  ): Promise<void> {
    const ipKey = this.crypto.hashIdentifier(`ip:${context.ipPrefix}`);
    const inviteKey = this.crypto.hashIdentifier(`invite:${inviteCode}`);
    const [ipCount, pairCount] = await Promise.all([
      this.securityStore.hitSlidingWindow(`security:guest:ip:${ipKey}`, 3_600),
      this.securityStore.hitSlidingWindow(
        `security:guest:pair:${ipKey}:${inviteKey}`,
        15 * 60,
      ),
    ]);
    if (ipCount > 20 || pairCount > 5) {
      throw this.invalidInvite();
    }
  }

  private async assertGuestPreviewRate(context: ClientContext): Promise<void> {
    const ipKey = this.crypto.hashIdentifier(`ip:${context.ipPrefix}`);
    const installationKey = this.crypto.hashIdentifier(
      `installation:${context.installationId}`,
    );
    const [ipCount, installationCount] = await Promise.all([
      this.securityStore.hitSlidingWindow(
        `security:guest-preview:ip:${ipKey}`,
        3_600,
      ),
      this.securityStore.hitSlidingWindow(
        `security:guest-preview:installation:${installationKey}`,
        15 * 60,
      ),
    ]);
    if (ipCount > 60 || installationCount > 20) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'INVITE_RATE_LIMITED',
          message: 'Too many invite validation attempts',
          retryAfter: 900,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private normalizeInviteCode(inviteCode: string): string {
    const normalized = inviteCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6,32}$/.test(normalized)) {
      throw this.invalidInvite();
    }
    return normalized;
  }

  private invalidInvite(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_INVITE_CODE',
      message: 'Invalid invite code',
    });
  }

  private throwAccountLinkRequired(provider: 'google' | 'kakao'): never {
    throw new ConflictException({
      code: 'ACCOUNT_LINK_REQUIRED',
      message: `Sign in to the existing account before linking ${provider}`,
    });
  }
}

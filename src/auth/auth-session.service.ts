import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  AuthSession,
  AuthSessionDocument,
} from '../schemas/auth-session.schema';
import {
  RefreshOperation,
  RefreshOperationDocument,
} from '../schemas/refresh-operation.schema';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../schemas/refresh-token.schema';
import { UserDocument } from '../schemas/user.schema';
import { UsersService } from '../users/users.service';
import { ApiRateLimitService } from './api-rate-limit.service';
import { AuthCryptoService } from './auth-crypto.service';
import { authUnauthorized } from './auth-errors';
import {
  AccountType,
  AuthTokenResponse,
  ClientContext,
  GUEST_SCOPES,
  MEMBER_SCOPES,
} from './auth.types';
import { SecurityStoreService } from './security-store.service';
import { TokenService } from './token.service';

type RefreshTransactionResult =
  | { kind: 'success'; response: AuthTokenResponse }
  | { kind: 'reuse'; sessionId: string };

export function classifyUsedRefreshAttempt(input: {
  tokenStatus: 'active' | 'used' | 'revoked';
  originalOperationIdHash?: string;
  requestedOperationIdHash: string;
  hasRetryResponse: boolean;
}): 'duplicate' | 'reuse' {
  return input.tokenStatus === 'used' &&
    input.originalOperationIdHash === input.requestedOperationIdHash &&
    input.hasRetryResponse
    ? 'duplicate'
    : 'reuse';
}

@Injectable()
export class AuthSessionService {
  private readonly idleLifetimeSeconds: number;
  private readonly absoluteLifetimeSeconds: number;
  private readonly operationRetrySeconds: number;
  private readonly operationRetentionSeconds: number;
  private readonly sessionRetentionDays: number;
  private readonly securityStateCacheSeconds: number;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AuthSession.name)
    private readonly authSessionModel: Model<AuthSessionDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(RefreshOperation.name)
    private readonly operationModel: Model<RefreshOperationDocument>,
    private readonly users: UsersService,
    private readonly tokenService: TokenService,
    private readonly crypto: AuthCryptoService,
    private readonly apiRateLimit: ApiRateLimitService,
    private readonly securityStore: SecurityStoreService,
    config: ConfigService,
  ) {
    this.idleLifetimeSeconds = this.durationSeconds(
      config.get('REFRESH_IDLE_EXPIRES_IN', '30d'),
      30 * 86_400,
    );
    this.absoluteLifetimeSeconds = this.durationSeconds(
      config.get('REFRESH_ABSOLUTE_EXPIRES_IN', '90d'),
      90 * 86_400,
    );
    this.operationRetrySeconds = Number(
      config.get('REFRESH_IDEMPOTENCY_RETRY_SECONDS', 60),
    );
    this.operationRetentionSeconds = Number(
      config.get('REFRESH_OPERATION_RETENTION_SECONDS', 300),
    );
    this.sessionRetentionDays = this.positiveInteger(
      config.get('AUTH_SESSION_RETENTION_DAYS', 180),
      180,
    );
    this.securityStateCacheSeconds = this.positiveInteger(
      config.get('USER_SECURITY_STATE_CACHE_SECONDS', 60),
      60,
    );
  }

  async createSession(
    user: UserDocument,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    this.assertUserActive(user);
    const now = new Date();
    const accountType = this.accountType(user);
    const scopes = this.scopesFor(accountType);
    const familyId = this.crypto.randomToken(24);
    const refreshToken = this.crypto.randomToken();
    const refreshTokenHash = this.crypto.hashToken(refreshToken);
    const absoluteExpiresAt = new Date(
      now.getTime() + this.absoluteLifetimeSeconds * 1_000,
    );
    const refreshExpiresAt = new Date(
      Math.min(
        now.getTime() + this.idleLifetimeSeconds * 1_000,
        absoluteExpiresAt.getTime(),
      ),
    );
    const installationIdHash = this.crypto.hashIdentifier(
      `installation:${context.installationId}`,
    );

    const evictedSessionIds: string[] = [];
    const response = await this.connection.transaction(async (mongoSession) => {
      const activeSessions = await this.authSessionModel
        .find({ userId: user._id, status: 'active' })
        .session(mongoSession);
      for (const oldSession of activeSessions) {
        oldSession.status = 'revoked';
        oldSession.revokedAt = now;
        oldSession.revokeReason = 'REPLACED_BY_NEW_LOGIN';
        await oldSession.save({ session: mongoSession });
        await this.refreshTokenModel.updateMany(
          { familyId: oldSession.tokenFamilyId, status: 'active' },
          { $set: { status: 'revoked' } },
          { session: mongoSession },
        );
        evictedSessionIds.push(oldSession._id.toString());
      }

      const [authSession] = await this.authSessionModel.create(
        [
          {
            userId: user._id,
            tokenFamilyId: familyId,
            installationIdHash,
            platform: context.platform,
            deviceName: context.deviceName,
            appVersion: context.appVersion,
            scopes,
            status: 'active',
            idleExpiresAt: refreshExpiresAt,
            absoluteExpiresAt,
            purgeAt: this.sessionPurgeAt(absoluteExpiresAt),
            lastSeenAt: now,
          },
        ],
        { session: mongoSession },
      );

      await this.refreshTokenModel.create(
        [
          {
            tokenHash: refreshTokenHash,
            sessionId: authSession._id,
            userId: user._id,
            familyId,
            generation: 0,
            status: 'active',
            expiresAt: refreshExpiresAt,
            purgeAt: this.tokenPurgeAt(absoluteExpiresAt),
          },
        ],
        { session: mongoSession },
      );

      const accessToken = await this.tokenService.issueAccessToken({
        userId: user._id.toString(),
        sessionId: authSession._id.toString(),
        scopes,
        accountType,
        securityVersion: user.securityVersion ?? 1,
      });
      return this.response(
        user,
        authSession._id.toString(),
        accessToken,
        refreshToken,
        refreshExpiresAt,
      );
    });

    await Promise.all(
      evictedSessionIds.map((sessionId) => this.denyAccessSession(sessionId)),
    );
    return response;
  }

  async refresh(
    refreshToken: string,
    operationId: string,
    context: ClientContext,
  ): Promise<AuthTokenResponse> {
    const now = new Date();
    const tokenHash = this.crypto.hashToken(refreshToken);
    const operationIdHash = this.crypto.hashIdentifier(
      `refresh-operation:${operationId}`,
    );

    const cached = await this.operationModel
      .findOne({
        requestTokenHash: tokenHash,
        operationIdHash,
        retryUntil: { $gt: now },
      })
      .select('+encryptedResponse');
    if (cached) {
      const cachedSession = await this.authSessionModel.findById(
        cached.sessionId,
      );
      if (!cachedSession) throw this.invalidRefresh();
      this.assertRefreshSessionActive(
        cachedSession,
        cachedSession.idleExpiresAt,
        now,
      );
      await this.assertRefreshContext(cachedSession, context);
      return this.crypto.decryptJson<AuthTokenResponse>(
        cached.encryptedResponse,
      );
    }

    const tokenBeforeRotation = await this.refreshTokenModel.findOne({
      tokenHash,
    });
    if (!tokenBeforeRotation) throw this.invalidRefresh();
    const authSessionBeforeRotation = await this.authSessionModel.findById(
      tokenBeforeRotation.sessionId,
    );
    if (!authSessionBeforeRotation) throw this.invalidRefresh();
    this.assertRefreshSessionActive(
      authSessionBeforeRotation,
      tokenBeforeRotation.expiresAt,
      now,
    );
    await this.assertRefreshContext(authSessionBeforeRotation, context);

    const transactionResult = await this.connection.transaction(
      async (mongoSession): Promise<RefreshTransactionResult> => {
        const currentToken = await this.refreshTokenModel.findOneAndUpdate(
          {
            tokenHash,
            status: 'active',
            expiresAt: { $gt: now },
          },
          {
            $set: {
              status: 'used',
              usedAt: now,
              usedByOperationIdHash: operationIdHash,
            },
          },
          { returnDocument: 'before', session: mongoSession },
        );

        if (!currentToken) {
          const usedToken = await this.refreshTokenModel
            .findOne({ tokenHash })
            .session(mongoSession);
          if (!usedToken) return { kind: 'reuse', sessionId: '' };

          const duplicateOperation = await this.operationModel
            .findOne({
              requestTokenHash: tokenHash,
              operationIdHash,
              retryUntil: { $gt: now },
            })
            .select('+encryptedResponse')
            .session(mongoSession);
          if (
            classifyUsedRefreshAttempt({
              tokenStatus: usedToken.status,
              originalOperationIdHash: usedToken.usedByOperationIdHash,
              requestedOperationIdHash: operationIdHash,
              hasRetryResponse: Boolean(duplicateOperation),
            }) === 'duplicate' &&
            duplicateOperation
          ) {
            const duplicateSession = await this.authSessionModel
              .findById(usedToken.sessionId)
              .session(mongoSession);
            if (!duplicateSession) {
              return {
                kind: 'reuse',
                sessionId: usedToken.sessionId.toString(),
              };
            }
            if (!this.refreshContextMatches(duplicateSession, context)) {
              await this.markFamily(
                duplicateSession.tokenFamilyId,
                duplicateSession._id.toString(),
                'REFRESH_INSTALLATION_MISMATCH',
                'compromised',
                mongoSession,
              );
              return {
                kind: 'reuse',
                sessionId: duplicateSession._id.toString(),
              };
            }
            return {
              kind: 'success',
              response: this.crypto.decryptJson<AuthTokenResponse>(
                duplicateOperation.encryptedResponse,
              ),
            };
          }

          await this.refreshTokenModel.updateMany(
            { familyId: usedToken.familyId, status: 'active' },
            { $set: { status: 'revoked' } },
            { session: mongoSession },
          );
          await this.authSessionModel.updateOne(
            { _id: usedToken.sessionId },
            {
              $set: {
                status: 'compromised',
                revokedAt: now,
                revokeReason: 'REFRESH_TOKEN_REUSE',
              },
            },
            { session: mongoSession },
          );
          return {
            kind: 'reuse',
            sessionId: usedToken.sessionId.toString(),
          };
        }

        const authSession = await this.authSessionModel
          .findById(currentToken.sessionId)
          .session(mongoSession);
        const user = await this.users.findById(
          currentToken.userId.toString(),
          mongoSession,
        );
        if (!authSession || !user) {
          return {
            kind: 'reuse',
            sessionId: currentToken.sessionId.toString(),
          };
        }
        if (!this.refreshContextMatches(authSession, context)) {
          await this.markFamily(
            authSession.tokenFamilyId,
            authSession._id.toString(),
            'REFRESH_INSTALLATION_MISMATCH',
            'compromised',
            mongoSession,
          );
          return {
            kind: 'reuse',
            sessionId: authSession._id.toString(),
          };
        }
        this.assertUserActive(user);

        const newRefreshToken = this.crypto.randomToken();
        const newTokenHash = this.crypto.hashToken(newRefreshToken);
        const refreshExpiresAt = new Date(
          Math.min(
            now.getTime() + this.idleLifetimeSeconds * 1_000,
            authSession.absoluteExpiresAt.getTime(),
          ),
        );
        const accountType = this.accountType(user);
        const scopes = authSession.scopes.length
          ? authSession.scopes
          : this.scopesFor(accountType);
        const accessToken = await this.tokenService.issueAccessToken({
          userId: user._id.toString(),
          sessionId: authSession._id.toString(),
          scopes,
          accountType,
          securityVersion: user.securityVersion ?? 1,
        });
        const response = this.response(
          user,
          authSession._id.toString(),
          accessToken,
          newRefreshToken,
          refreshExpiresAt,
        );

        await this.refreshTokenModel.updateOne(
          { _id: currentToken._id },
          { $set: { replacedByTokenHash: newTokenHash } },
          { session: mongoSession },
        );
        await this.refreshTokenModel.create(
          [
            {
              tokenHash: newTokenHash,
              sessionId: authSession._id,
              userId: user._id,
              familyId: currentToken.familyId,
              generation: currentToken.generation + 1,
              status: 'active',
              expiresAt: refreshExpiresAt,
              purgeAt: this.tokenPurgeAt(authSession.absoluteExpiresAt),
            },
          ],
          { session: mongoSession },
        );
        await this.operationModel.create(
          [
            {
              operationIdHash,
              requestTokenHash: tokenHash,
              sessionId: authSession._id,
              status: 'completed',
              encryptedResponse: this.crypto.encryptJson(response),
              retryUntil: new Date(
                now.getTime() + this.operationRetrySeconds * 1_000,
              ),
              purgeAt: new Date(
                now.getTime() + this.operationRetentionSeconds * 1_000,
              ),
            },
          ],
          { session: mongoSession },
        );
        authSession.idleExpiresAt = refreshExpiresAt;
        authSession.lastSeenAt = now;
        await authSession.save({ session: mongoSession });
        return { kind: 'success', response };
      },
    );

    if (transactionResult.kind === 'reuse') {
      if (transactionResult.sessionId) {
        await this.denyAccessSession(transactionResult.sessionId);
      }
      throw this.invalidRefresh();
    }
    return transactionResult.response;
  }

  async revokeCurrentSession(
    sessionId: string,
    reason = 'LOGOUT',
  ): Promise<void> {
    const authSession = await this.authSessionModel.findById(sessionId);
    if (!authSession) return;
    await this.revokeFamily(
      authSession.tokenFamilyId,
      sessionId,
      reason,
      'revoked',
    );
  }

  async revokeSessionByRefreshToken(
    refreshToken: string,
    reason = 'REFRESH_LOGOUT',
  ): Promise<void> {
    const token = await this.refreshTokenModel
      .findOne({ tokenHash: this.crypto.hashToken(refreshToken) })
      .select('sessionId');
    if (!token) return;
    await this.revokeCurrentSession(token.sessionId.toString(), reason);
  }

  async revokeAllUserSessions(
    userId: string,
    reason = 'INTERNAL_REVOKE_ALL',
  ): Promise<void> {
    const sessions = await this.authSessionModel.find({
      userId: new Types.ObjectId(userId),
      status: 'active',
    });
    await Promise.all(
      sessions.map((authSession) =>
        this.revokeFamily(
          authSession.tokenFamilyId,
          authSession._id.toString(),
          reason,
          'revoked',
        ),
      ),
    );
  }

  async assertAccessAllowed(
    userId: string,
    sessionId: string,
    tokenSecurityVersion: number,
    path: string,
    ipPrefix: string,
  ): Promise<void> {
    if (await this.securityStore.get(`security:revoked-session:${sessionId}`)) {
      throw authUnauthorized('SESSION_REVOKED', 'Session revoked');
    }
    await this.assertActiveAccessSession(userId, sessionId, new Date());
    await this.assertUserSecurityState(userId, tokenSecurityVersion);
    await this.apiRateLimit.assertAllowed(sessionId, path, ipPrefix);
  }

  async invalidateUserSecurityState(userId: string): Promise<void> {
    await this.securityStore.delete(this.userSecurityStateKey(userId));
  }

  private async revokeFamily(
    familyId: string,
    sessionId: string,
    reason: string,
    status: 'revoked' | 'compromised',
  ): Promise<void> {
    await this.connection.transaction(async (mongoSession) => {
      await this.markFamily(familyId, sessionId, reason, status, mongoSession);
    });
    await this.denyAccessSession(sessionId);
  }

  private async markFamily(
    familyId: string,
    sessionId: string,
    reason: string,
    status: 'revoked' | 'compromised',
    mongoSession?: ClientSession,
  ): Promise<void> {
    const now = new Date();
    const options = mongoSession ? { session: mongoSession } : {};
    await this.refreshTokenModel.updateMany(
      { familyId, status: 'active' },
      { $set: { status: 'revoked' } },
      options,
    );
    await this.authSessionModel.updateOne(
      { _id: new Types.ObjectId(sessionId) },
      {
        $set: {
          status,
          revokedAt: now,
          revokeReason: reason,
        },
      },
      options,
    );
  }

  private async denyAccessSession(sessionId: string): Promise<void> {
    await this.securityStore.set(
      `security:revoked-session:${sessionId}`,
      '1',
      this.tokenService.accessTokenLifetimeSeconds,
    );
  }

  private response(
    user: UserDocument,
    sessionId: string,
    accessToken: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): AuthTokenResponse {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.accessTokenLifetimeSeconds,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      sessionId,
      user: this.users.toPublicUser(user),
    };
  }

  private accountType(user: UserDocument): AccountType {
    return user.accountType ?? (user.isGuest ? 'guest' : 'member');
  }

  private scopesFor(accountType: AccountType): string[] {
    return accountType === 'guest' ? [...GUEST_SCOPES] : [...MEMBER_SCOPES];
  }

  private assertUserActive(user: UserDocument): void {
    if (user.status && user.status !== 'active') {
      throw authUnauthorized('ACCOUNT_UNAVAILABLE', 'Account is unavailable');
    }
  }

  private assertRefreshSessionActive(
    authSession: AuthSessionDocument,
    tokenExpiresAt: Date,
    now: Date,
  ): void {
    if (
      authSession.status !== 'active' ||
      tokenExpiresAt <= now ||
      authSession.idleExpiresAt <= now ||
      authSession.absoluteExpiresAt <= now
    ) {
      throw this.invalidRefresh();
    }
  }

  private async assertActiveAccessSession(
    userId: string,
    sessionId: string,
    now: Date,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(sessionId)) {
      throw authUnauthorized('TOKEN_INVALID', 'Access token is invalid');
    }

    const authSession = await this.authSessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(userId),
        status: 'active',
        idleExpiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      })
      .select('_id')
      .exec();
    if (!authSession) {
      throw authUnauthorized('SESSION_REVOKED', 'Session revoked');
    }
  }

  private async assertRefreshContext(
    authSession: AuthSessionDocument,
    context: ClientContext,
  ): Promise<void> {
    if (this.refreshContextMatches(authSession, context)) return;
    await this.revokeFamily(
      authSession.tokenFamilyId,
      authSession._id.toString(),
      'REFRESH_INSTALLATION_MISMATCH',
      'compromised',
    );
    throw this.invalidRefresh();
  }

  private refreshContextMatches(
    authSession: AuthSessionDocument,
    context: ClientContext,
  ): boolean {
    return (
      authSession.installationIdHash ===
      this.crypto.hashIdentifier(`installation:${context.installationId}`)
    );
  }

  private tokenPurgeAt(absoluteExpiresAt: Date): Date {
    return new Date(absoluteExpiresAt.getTime() + 30 * 86_400_000);
  }

  private sessionPurgeAt(absoluteExpiresAt: Date): Date {
    return new Date(
      absoluteExpiresAt.getTime() + this.sessionRetentionDays * 86_400_000,
    );
  }

  private async assertUserSecurityState(
    userId: string,
    tokenSecurityVersion: number,
  ): Promise<void> {
    const key = this.userSecurityStateKey(userId);
    let serialized = await this.securityStore.get(key);

    if (!serialized) {
      const user = await this.users.findById(userId);
      if (!user) {
        throw authUnauthorized('ACCOUNT_UNAVAILABLE', 'Account is unavailable');
      }
      serialized = `${user.status ?? 'active'}:${user.securityVersion ?? 1}`;
      await this.securityStore.set(
        key,
        serialized,
        this.securityStateCacheSeconds,
      );
    }

    const separator = serialized.lastIndexOf(':');
    const status = separator >= 0 ? serialized.slice(0, separator) : '';
    const currentVersion = Number(
      separator >= 0 ? serialized.slice(separator + 1) : NaN,
    );
    if (
      status !== 'active' ||
      !Number.isInteger(currentVersion) ||
      currentVersion !== tokenSecurityVersion
    ) {
      throw authUnauthorized(
        'TOKEN_OBSOLETE',
        'Token security version is obsolete',
      );
    }
  }

  private userSecurityStateKey(userId: string): string {
    return `security:user-state:${userId}`;
  }

  private invalidRefresh(): UnauthorizedException {
    return authUnauthorized('REFRESH_INVALID', 'Invalid refresh token');
  }

  private durationSeconds(value: string | number, fallback: number): number {
    if (typeof value === 'number' && value > 0) return value;
    const match = String(value)
      .trim()
      .match(/^(\d+)(s|m|h|d)$/);
    if (!match) return fallback;
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[match[2]];
    return amount * (multiplier ?? 1);
  }

  private positiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}

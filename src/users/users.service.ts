import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { RefreshReceipt, User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  async findByOAuth(
    provider: string,
    oauthId: string,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne({ oauthProvider: provider, oauthId }).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateById(
    id: string,
    data: Partial<User>,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, data, { returnDocument: 'after' })
      .exec();
  }

  async consumeRefreshToken(
    id: string,
    refreshToken: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { _id: id, refreshTokens: refreshToken },
        { $pull: { refreshTokens: refreshToken } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async appendRefreshToken(
    id: string,
    refreshToken: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        {
          $push: {
            refreshTokens: {
              $each: [refreshToken],
              $slice: -5,
            },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  refreshTokenHash(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  async findRefreshReceipt(
    id: string,
    operationId: string,
    requestTokenHash: string,
    now = new Date(),
  ): Promise<{ user: UserDocument; receipt: RefreshReceipt } | null> {
    const user = await this.userModel
      .findOne({
        _id: id,
        refreshReceipts: {
          $elemMatch: {
            operationId,
            requestTokenHash,
            expiresAt: { $gt: now },
          },
        },
      })
      .exec();
    if (!user) return null;
    const receipt = (user.refreshReceipts ?? []).find(
      (entry) =>
        entry.operationId === operationId &&
        entry.requestTokenHash === requestTokenHash &&
        entry.expiresAt > now,
    );
    return receipt ? { user, receipt } : null;
  }

  async rotateRefreshToken(
    id: string,
    currentRefreshToken: string,
    nextRefreshToken: string,
    receipt: RefreshReceipt,
    now = new Date(),
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        {
          _id: id,
          refreshTokens: currentRefreshToken,
          'refreshReceipts.operationId': { $ne: receipt.operationId },
        },
        [
          {
            $set: {
              refreshTokens: {
                $slice: [
                  {
                    $concatArrays: [
                      {
                        $filter: {
                          input: { $ifNull: ['$refreshTokens', []] },
                          as: 'token',
                          cond: { $ne: ['$$token', currentRefreshToken] },
                        },
                      },
                      [nextRefreshToken],
                    ],
                  },
                  -5,
                ],
              },
              refreshReceipts: {
                $slice: [
                  {
                    $concatArrays: [
                      {
                        $filter: {
                          input: { $ifNull: ['$refreshReceipts', []] },
                          as: 'receipt',
                          cond: { $gt: ['$$receipt.expiresAt', now] },
                        },
                      },
                      [receipt],
                    ],
                  },
                  -5,
                ],
              },
            },
          },
        ],
        { returnDocument: 'after', updatePipeline: true },
      )
      .exec();
  }

  async revokeRefreshToken(id: string, refreshToken: string) {
    const requestTokenHash = this.refreshTokenHash(refreshToken);
    await this.userModel.updateOne(
      { _id: id },
      {
        $pull: {
          refreshTokens: refreshToken,
          refreshReceipts: {
            $or: [{ refreshToken }, { requestTokenHash }],
          },
        },
      },
    );
  }

  async deleteById(id: string) {
    await this.userModel.deleteOne({ _id: id });
  }

  async listUsers(options: {
    page?: number;
    limit?: number;
    q?: string;
    includeGuests?: boolean;
  }) {
    const page =
      Number.isInteger(options.page) && (options.page ?? 0) > 0
        ? (options.page as number)
        : 1;
    const limit =
      Number.isInteger(options.limit) && (options.limit ?? 0) > 0
        ? Math.min(100, options.limit as number)
        : 50;
    const filter: Record<string, unknown> = {};

    if (!options.includeGuests) {
      filter.isGuest = { $ne: true };
    }
    if (options.q?.trim()) {
      const q = options.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { nickname: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data: docs.map((u) => this.toDirectoryUser(u)),
      meta: { total, page, limit },
    };
  }

  toPublicUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email ?? null,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl ?? null,
      travelType: user.travelType ?? null,
      onboardingCompleted: user.onboardingCompleted,
      isGuest: user.isGuest,
    };
  }

  /** 공개 사용자 디렉터리에서는 로그인 식별자인 이메일을 노출하지 않는다. */
  toDirectoryUser(user: UserDocument) {
    const publicUser = this.toPublicUser(user);
    return {
      id: publicUser.id,
      nickname: publicUser.nickname,
      profileImageUrl: publicUser.profileImageUrl,
      travelType: publicUser.travelType,
      onboardingCompleted: publicUser.onboardingCompleted,
      isGuest: publicUser.isGuest,
    };
  }

  /** 본인용 전체 프로필 (passwordHash / refreshTokens 제외) */
  toFullUser(user: UserDocument) {
    return {
      ...this.toPublicUser(user),
      oauthProvider: user.oauthProvider ?? null,
      quizPreferences: user.quizPreferences ?? null,
      personalityAxes: user.personalityAxes ?? null,
      hasLicense: user.hasLicense ?? null,
      hasCar: user.hasCar ?? null,
      mobilityConstraints: user.mobilityConstraints ?? [],
      birthYear: user.birthYear ?? null,
      interestTags: user.interestTags ?? [],
      createdAt:
        (user as UserDocument & { createdAt?: Date }).createdAt ?? null,
      updatedAt:
        (user as UserDocument & { updatedAt?: Date }).updatedAt ?? null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByOAuth(provider: string, oauthId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ oauthProvider: provider, oauthId }).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateById(id: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async listUsers(options: {
    page?: number;
    limit?: number;
    q?: string;
    includeGuests?: boolean;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const filter: Record<string, unknown> = {};

    if (!options.includeGuests) {
      filter.isGuest = { $ne: true };
    }
    if (options.q?.trim()) {
      const q = options.q.trim();
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
      data: docs.map((u) => this.toPublicUser(u)),
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
      createdAt: (user as UserDocument & { createdAt?: Date }).createdAt ?? null,
      updatedAt: (user as UserDocument & { updatedAt?: Date }).updatedAt ?? null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findById(id)
      .session(session ?? null)
      .exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByOAuth(provider: string, oauthId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ oauthProvider: provider, oauthId }).exec();
  }

  async findGuestByInstallation(
    installationIdHash: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        guestInstallationHash: installationIdHash,
        accountType: 'guest',
        status: 'active',
      })
      .exec();
  }

  async create(
    data: Partial<User>,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const [user] = await this.userModel.create([data], { session });
    return user;
  }

  async updateById(
    id: string,
    data: Partial<User>,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, data, { returnDocument: 'after', session })
      .exec();
  }

  async anonymizeDeletedAccount(
    id: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.userModel.updateOne(
      { _id: id, status: { $ne: 'deleted' } },
      {
        $set: {
          nickname: '탈퇴한 사용자',
          status: 'deleted',
          onboardingCompleted: false,
          isGuest: false,
          accountType: 'member',
          quizAnswers: {},
          quizPreferences: {},
          mobilityConstraints: [],
          interestTags: [],
        },
        $inc: { securityVersion: 1 },
        $unset: {
          email: 1,
          passwordHash: 1,
          oauthProvider: 1,
          oauthId: 1,
          profileImageUrl: 1,
          travelType: 1,
          personalityAxes: 1,
          hasLicense: 1,
          hasCar: 1,
          birthYear: 1,
          guestInstallationHash: 1,
          guestExpiresAt: 1,
          refreshTokens: 1,
        },
      },
      { session },
    );
  }

  toPublicUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      travelType: user.travelType,
      onboardingCompleted: user.onboardingCompleted,
      isGuest: user.isGuest,
      accountType: user.accountType ?? (user.isGuest ? 'guest' : 'member'),
    };
  }
}

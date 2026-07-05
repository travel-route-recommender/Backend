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

  toPublicUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      travelType: user.travelType,
      onboardingCompleted: user.onboardingCompleted,
      isGuest: user.isGuest,
    };
  }
}

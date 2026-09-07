import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import {
  TravelRoom,
  TravelRoomDocument,
} from '../schemas/travel-room.schema';
import {
  RoomDocumentFile,
  RoomDocumentDoc,
} from '../schemas/room-document.schema';
import { UserSave, UserSaveDocument } from '../schemas/user-save.schema';
import {
  TestResult,
  TestResultDocument,
} from '../schemas/test-result.schema';
import {
  OnboardingSurvey,
  OnboardingSurveyDocument,
} from '../schemas/onboarding-survey.schema';
import { LocalUploadService } from '../common/storage/local-upload.service';
import { AppleService } from '../auth/apple.service';

const ANON_NICKNAME = '탈퇴한 사용자';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    @InjectModel(RoomDocumentFile.name)
    private docModel: Model<RoomDocumentDoc>,
    @InjectModel(UserSave.name) private saveModel: Model<UserSaveDocument>,
    @InjectModel(TestResult.name)
    private testResultModel: Model<TestResultDocument>,
    @InjectModel(OnboardingSurvey.name)
    private onboardingModel: Model<OnboardingSurveyDocument>,
    private uploads: LocalUploadService,
    private appleService: AppleService,
  ) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
        deletedAt: { $exists: false },
      })
      .exec();
  }

  async findByOAuth(provider: string, oauthId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        oauthProvider: provider,
        oauthId,
        deletedAt: { $exists: false },
      })
      .exec();
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

    filter.deletedAt = { $exists: false };
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
      termsVersion: user.termsVersion ?? null,
      privacyConsentVersion: user.privacyConsentVersion ?? null,
      overFourteenConfirmed: user.overFourteenConfirmed ?? false,
      termsConsentedAt: user.termsConsentedAt ?? null,
    };
  }

  async deleteMe(userId: string, password?: string) {
    const user = await this.findById(userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid token');
    }

    if (user.passwordHash) {
      if (!password) {
        throw new BadRequestException('이메일 계정은 현재 비밀번호가 필요합니다');
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new UnauthorizedException('비밀번호가 일치하지 않습니다');
    }

    if (user.oauthProvider === 'apple' && user.appleRefreshTokenEnc) {
      const token = this.appleService.decryptRefreshToken(
        user.appleRefreshTokenEnc,
      );
      if (token) await this.appleService.revokeRefreshToken(token);
    }

    const uid = user._id;
    const ownedRooms = await this.roomModel.find({
      members: { $elemMatch: { userId: uid, role: 'owner' } },
      status: { $ne: 'closed' },
    });
    for (const room of ownedRooms) {
      room.status = 'closed';
      await room.save();
    }

    const rooms = await this.roomModel.find({
      $or: [
        { 'members.userId': uid },
        { 'schedule.days.items.tickets.uploadedBy': uid },
      ],
    });
    for (const room of rooms) {
      const files: string[] = [];
      for (const day of room.schedule?.days ?? []) {
        for (const item of day.items ?? []) {
          const keep = (item.tickets ?? []).filter((t) => {
            if (t.uploadedBy?.toString() === userId) {
              files.push(t.imageUrl);
              return false;
            }
            return true;
          });
          item.tickets = keep;
        }
      }
      await room.save();
      await Promise.all(
        files.map((url) => this.uploads.deleteByPublicUrl(url)),
      );
    }

    const docs = await this.docModel.find({ uploadedBy: uid });
    for (const doc of docs) {
      await this.uploads.deleteByPublicUrl(doc.fileUrl);
      await doc.deleteOne();
    }

    await Promise.all([
      this.saveModel.deleteMany({ userId: uid }),
      this.testResultModel.deleteMany({ userId: uid }),
      this.onboardingModel.deleteMany({ userId: uid }),
    ]);

    await this.userModel.updateOne(
      { _id: uid },
      {
        $set: {
          nickname: ANON_NICKNAME,
          deletedAt: new Date(),
          refreshTokens: [],
          onboardingCompleted: false,
          isGuest: user.isGuest,
          overFourteenConfirmed: false,
        },
        $unset: {
          email: 1,
          passwordHash: 1,
          oauthProvider: 1,
          oauthId: 1,
          profileImageUrl: 1,
          travelType: 1,
          quizPreferences: 1,
          personalityAxes: 1,
          hasLicense: 1,
          hasCar: 1,
          mobilityConstraints: 1,
          birthYear: 1,
          interestTags: 1,
          termsVersion: 1,
          privacyConsentVersion: 1,
          termsConsentedAt: 1,
          appleRefreshTokenEnc: 1,
        },
      },
    );

    return { success: true };
  }
}

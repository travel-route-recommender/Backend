import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OnboardingSurvey,
  OnboardingSurveyDocument,
} from '../schemas/onboarding-survey.schema';
import { UsersService } from '../users/users.service';
import { SubmitOnboardingSurveyDto } from './dto/submit-onboarding-survey.dto';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSurvey.name)
    private surveyModel: Model<OnboardingSurveyDocument>,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
    private readonly usersService: UsersService,
  ) {}

  async getStatus(userId: string) {
    const [survey, user] = await Promise.all([
      this.surveyModel.findOne({ userId: new Types.ObjectId(userId) }).exec(),
      this.usersService.findById(userId),
    ]);
    return {
      completed: Boolean(survey?.completedAt || user?.onboardingCompleted),
      answeredCount: this.countFields(survey),
    };
  }

  async getSurvey(userId: string) {
    const survey = await this.surveyModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    if (!survey) return null;

    return this.formatSurvey(survey);
  }

  async submitSurvey(userId: string, dto: SubmitOnboardingSurveyDto) {
    const payload = {
      userId: new Types.ObjectId(userId),
      answers: dto.answers ?? {},
      hasLicense: dto.hasLicense,
      hasCar: dto.hasCar,
      mobilityConstraints: dto.mobilityConstraints ?? [],
      birthYear: dto.birthYear,
      age: dto.age,
      tags: dto.tags ?? [],
      completedAt: new Date(),
    };

    const survey = await this.surveyModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      payload,
      { upsert: true, returnDocument: 'after' },
    );

    const updatedUser = await this.usersService.updateById(userId, {
      hasLicense: dto.hasLicense,
      hasCar: dto.hasCar,
      mobilityConstraints: dto.mobilityConstraints ?? [],
      birthYear: dto.birthYear,
      interestTags: dto.tags ?? [],
      onboardingCompleted: true,
    });
    if (!updatedUser) {
      throw new BadRequestException('사용자 정보를 갱신할 수 없습니다.');
    }
    const userObjectId = new Types.ObjectId(userId);
    const values = updatedUser.mobilityConstraints ?? [];
    await this.roomModel.updateMany(
      { 'members.userId': userObjectId },
      {
        $set: {
          'members.$[member].mobilityConstraints': {
            values,
            status: 'present',
            source: 'onboarding',
            version: 1,
            updatedAt: new Date(),
          },
          'members.$[member].interestTagsSnapshot':
            updatedUser.interestTags ?? [],
          'members.$[member].preferenceUpdatedAt': new Date(),
        },
        $inc: { factsVersion: 1 },
      },
      { arrayFilters: [{ 'member.userId': userObjectId }] },
    );

    return this.formatSurvey(survey);
  }

  private formatSurvey(survey: OnboardingSurveyDocument) {
    return {
      answers: survey.answers ?? {},
      hasLicense: survey.hasLicense ?? null,
      hasCar: survey.hasCar ?? null,
      mobilityConstraints: survey.mobilityConstraints ?? [],
      birthYear: survey.birthYear ?? null,
      age: survey.age ?? null,
      tags: survey.tags ?? [],
      completedAt: survey.completedAt,
    };
  }

  private countFields(survey: OnboardingSurveyDocument | null) {
    if (!survey) return 0;
    let n = Object.keys(survey.answers ?? {}).length;
    if (survey.hasLicense != null) n += 1;
    if (survey.hasCar != null) n += 1;
    n += 1;
    if (survey.birthYear != null || survey.age != null) n += 1;
    if (survey.tags?.length) n += 1;
    return n;
  }
}

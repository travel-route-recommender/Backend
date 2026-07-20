import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OnboardingSurvey,
  OnboardingSurveyDocument,
} from '../schemas/onboarding-survey.schema';
import { UsersService } from '../users/users.service';
import { SubmitOnboardingSurveyDto } from './dto/submit-onboarding-survey.dto';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSurvey.name)
    private surveyModel: Model<OnboardingSurveyDocument>,
    private readonly usersService: UsersService,
  ) {}

  async getStatus(userId: string) {
    const survey = await this.surveyModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    return {
      completed: Boolean(survey?.completedAt),
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
      { upsert: true, new: true },
    );

    await this.usersService.updateById(userId, {
      hasLicense: dto.hasLicense,
      hasCar: dto.hasCar,
      mobilityConstraints: dto.mobilityConstraints ?? [],
      birthYear: dto.birthYear,
      interestTags: dto.tags ?? [],
      onboardingCompleted: true,
    });

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
    if (survey.mobilityConstraints?.length) n += 1;
    if (survey.birthYear != null || survey.age != null) n += 1;
    if (survey.tags?.length) n += 1;
    return n;
  }
}

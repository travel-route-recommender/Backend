import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OnboardingSurvey,
  OnboardingSurveyDocument,
} from '../schemas/onboarding-survey.schema';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSurvey.name)
    private surveyModel: Model<OnboardingSurveyDocument>,
  ) {}

  async getStatus(userId: string) {
    const survey = await this.surveyModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    return {
      completed: Boolean(survey?.completedAt),
      answeredCount: Object.keys(survey?.answers ?? {}).length,
    };
  }

  async getSurvey(userId: string) {
    const survey = await this.surveyModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    if (!survey) return null;

    return {
      answers: survey.answers,
      completedAt: survey.completedAt,
    };
  }

  async submitSurvey(userId: string, answers: Record<string, string>) {
    const survey = await this.surveyModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        userId: new Types.ObjectId(userId),
        answers,
        completedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    return {
      answers: survey.answers,
      completedAt: survey.completedAt,
    };
  }
}

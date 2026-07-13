import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TestResult, TestResultDocument } from '../schemas/test-result.schema';
import {
  QUIZ_QUESTIONS,
  calculateTravelType,
} from './quiz.data';

@Injectable()
export class QuizService {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(TestResult.name)
    private testResultModel: Model<TestResultDocument>,
  ) {}

  getQuestions() {
    return QUIZ_QUESTIONS;
  }

  async getLatestResult(userId: string) {
    return this.testResultModel
      .findOne({ userId: new Types.ObjectId(userId), isLatest: true })
      .exec();
  }

  async getStatus(userId: string) {
    const [user, latestResult] = await Promise.all([
      this.usersService.findById(userId),
      this.getLatestResult(userId),
    ]);

    return {
      completed: Boolean(latestResult?.travelType),
      onboardingCompleted: user?.onboardingCompleted ?? false,
      answeredCount: Object.keys(latestResult?.answers ?? {}).length,
      totalQuestions: QUIZ_QUESTIONS.length,
    };
  }

  async submit(userId: string, answers: Record<string, string>) {
    const travelType = calculateTravelType(answers);
    const userObjectId = new Types.ObjectId(userId);

    await this.testResultModel.updateMany(
      { userId: userObjectId, isLatest: true },
      { isLatest: false },
    );

    await this.testResultModel.create({
      userId: userObjectId,
      answers,
      travelType,
      isLatest: true,
    });

    const user = await this.usersService.updateById(userId, { travelType });
    return {
      travelType,
      user: user ? this.usersService.toPublicUser(user) : null,
    };
  }
}

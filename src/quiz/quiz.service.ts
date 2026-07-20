import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TestResult, TestResultDocument } from '../schemas/test-result.schema';
import {
  QUIZ_QUESTIONS,
  QUIZ_STEPS,
  MOCK_SPENDING_TAGS,
  SPENDING_CATEGORIES,
  buildPreferences,
  calculateTravelType,
  computePersonalityAxes,
  countAnsweredSteps,
  deriveTravelType,
  resolveStaminaLevel,
} from './quiz.data';
import { QuizResponses } from './quiz.types';
import { QuizResponsesDto } from './dto/quiz-session.dto';

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

  getSteps() {
    return QUIZ_STEPS;
  }

  getTags() {
    return {
      source: 'mock' as const,
      categories: SPENDING_CATEGORIES,
      tags: MOCK_SPENDING_TAGS,
    };
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

    const responses = (latestResult?.responses ?? {}) as QuizResponses;
    return {
      completed: latestResult?.status === 'completed',
      onboardingCompleted: user?.onboardingCompleted ?? false,
      sessionId: latestResult?._id?.toString() ?? null,
      status: latestResult?.status ?? null,
      answeredCount: countAnsweredSteps(responses),
      totalQuestions: QUIZ_STEPS.length,
      totalSteps: QUIZ_STEPS.length,
    };
  }

  async getMe(userId: string) {
    const [user, latest] = await Promise.all([
      this.usersService.findById(userId),
      this.getLatestResult(userId),
    ]);

    if (!latest || latest.status !== 'completed') {
      return {
        completed: false,
        travelType: user?.travelType ?? null,
        axes: user?.personalityAxes ?? null,
        preferences: user?.quizPreferences ?? null,
        stamina: null,
      };
    }

    const stamina = resolveStaminaLevel({
      staminaLevel: (latest.responses as QuizResponses)?.staminaLevel,
      birthYear: user?.birthYear,
      mobilityConstraints: user?.mobilityConstraints,
    });

    return {
      completed: true,
      sessionId: latest._id.toString(),
      travelType: latest.travelType ?? user?.travelType ?? null,
      axes: latest.axes ?? user?.personalityAxes ?? null,
      preferences: latest.preferences ?? user?.quizPreferences ?? null,
      stamina,
      completedAt: latest.completedAt,
    };
  }

  async createSession(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    await this.testResultModel.updateMany(
      { userId: userObjectId, isLatest: true },
      { isLatest: false },
    );

    const session = await this.testResultModel.create({
      userId: userObjectId,
      status: 'in_progress',
      responses: {},
      isLatest: true,
    });

    return this.formatSession(session);
  }

  async patchSession(userId: string, sessionId: string, dto: QuizResponsesDto) {
    const session = await this.findOwnedSession(userId, sessionId);
    if (session.status === 'completed') {
      throw new BadRequestException('이미 완료된 세션입니다.');
    }

    const merged = {
      ...(session.responses as object),
      ...this.stripUndefined(dto as object),
    } as QuizResponses;

    session.responses = merged as Record<string, unknown>;
    await session.save();
    return this.formatSession(session);
  }

  async completeSession(userId: string, sessionId: string, dto?: QuizResponsesDto) {
    const session = await this.findOwnedSession(userId, sessionId);
    if (session.status === 'completed') {
      throw new BadRequestException('이미 완료된 세션입니다.');
    }

    if (dto) {
      session.responses = {
        ...(session.responses as object),
        ...this.stripUndefined(dto as object),
      } as Record<string, unknown>;
    }

    const responses = session.responses as QuizResponses;
    const answered = countAnsweredSteps(responses);
    if (answered < 1) {
      throw new BadRequestException(
        '최소 한 개 이상의 테스트 응답이 필요합니다.',
      );
    }

    const user = await this.usersService.findById(userId);
    const axes = computePersonalityAxes(responses);
    const travelType = deriveTravelType(axes);
    const preferences = buildPreferences(responses, axes);
    const stamina = resolveStaminaLevel({
      staminaLevel: responses.staminaLevel,
      birthYear: user?.birthYear,
      mobilityConstraints: user?.mobilityConstraints,
    });

    if (preferences.staminaLevel == null) {
      preferences.staminaLevel = stamina.staminaLevel;
    }

    session.status = 'completed';
    session.axes = axes;
    session.preferences = preferences as unknown as Record<string, unknown>;
    session.travelType = travelType;
    session.completedAt = new Date();
    await session.save();

    const updatedUser = await this.usersService.updateById(userId, {
      travelType,
      quizPreferences: preferences as unknown as Record<string, unknown>,
      personalityAxes: axes,
    });

    return {
      sessionId: session._id.toString(),
      travelType,
      axes,
      preferences,
      stamina,
      user: updatedUser
        ? this.usersService.toPublicUser(updatedUser)
        : null,
    };
  }

  /** 레거시: 한 방 제출 */
  async submit(userId: string, answers: Record<string, string>) {
    const travelType = calculateTravelType(answers);
    const userObjectId = new Types.ObjectId(userId);

    await this.testResultModel.updateMany(
      { userId: userObjectId, isLatest: true },
      { isLatest: false },
    );

    await this.testResultModel.create({
      userId: userObjectId,
      status: 'completed',
      answers,
      responses: { legacyAnswers: answers },
      travelType,
      isLatest: true,
      completedAt: new Date(),
    });

    const user = await this.usersService.updateById(userId, { travelType });
    return {
      travelType,
      user: user ? this.usersService.toPublicUser(user) : null,
    };
  }

  private async findOwnedSession(userId: string, sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('세션을 찾을 수 없습니다.');
    }
    const session = await this.testResultModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!session) {
      throw new NotFoundException('세션을 찾을 수 없습니다.');
    }
    return session;
  }

  private formatSession(session: TestResultDocument) {
    const responses = (session.responses ?? {}) as QuizResponses;
    return {
      id: session._id.toString(),
      status: session.status,
      responses,
      answeredCount: countAnsweredSteps(responses),
      totalSteps: QUIZ_STEPS.length,
      travelType: session.travelType ?? null,
      axes: session.axes ?? null,
      preferences: session.preferences ?? null,
      completedAt: session.completedAt ?? null,
    };
  }

  private stripUndefined(obj: object) {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    );
  }
}

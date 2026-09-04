import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { TestResult, TestResultDocument } from '../schemas/test-result.schema';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import { TravelType } from '../schemas/user.schema';
import {
  QUIZ_QUESTIONS,
  QUIZ_STEPS,
  SPENDING_TAGS,
  SPENDING_CATEGORIES,
  BUDGET_RANK_ITEMS,
  areAllStepsAnswered,
  buildPreferences,
  calculateTravelType,
  computePersonalityAxes,
  countAnsweredSteps,
  deriveTravelType,
  missingSteps,
  resolveStaminaLevel,
} from './quiz.data';
import { QuizResponses } from './quiz.types';
import {
  PartialQuizResponsesDto,
  QuizResponsesDto,
} from './dto/quiz-session.dto';

@Injectable()
export class QuizService {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(TestResult.name)
    private testResultModel: Model<TestResultDocument>,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  getQuestions() {
    return QUIZ_QUESTIONS;
  }

  getSteps() {
    return QUIZ_STEPS;
  }

  getTags() {
    return {
      source: 'product-taxonomy' as const,
      note: '예산은 금액 추정이 아니라 항목별 우선순위로 입력합니다.',
      budgetRankItems: BUDGET_RANK_ITEMS,
      categories: SPENDING_CATEGORIES,
      tags: SPENDING_TAGS,
    };
  }

  async getLatestAttempt(userId: string) {
    return this.testResultModel
      .findOne({ userId: new Types.ObjectId(userId), isLatest: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getLatestCompleted(userId: string) {
    return this.testResultModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: 'completed',
        isLatestCompleted: true,
      })
      .exec()
      .then(async (doc) => {
        if (doc) return doc;
        return this.testResultModel
          .findOne({
            userId: new Types.ObjectId(userId),
            status: 'completed',
          })
          .sort({ completedAt: -1 })
          .exec();
      });
  }

  async getStatus(userId: string) {
    const [user, attempt, completed] = await Promise.all([
      this.usersService.findById(userId),
      this.getLatestAttempt(userId),
      this.getLatestCompleted(userId),
    ]);

    const responses = (attempt?.responses ?? {}) as QuizResponses;
    return {
      completed: Boolean(completed?.travelType ?? user?.travelType),
      onboardingCompleted: user?.onboardingCompleted ?? false,
      sessionId: attempt?._id?.toString() ?? completed?._id?.toString() ?? null,
      activeSessionId:
        attempt?.status === 'in_progress' ? attempt._id.toString() : null,
      status: attempt?.status ?? completed?.status ?? null,
      answeredCount: countAnsweredSteps(responses),
      totalQuestions: QUIZ_STEPS.length,
      totalSteps: QUIZ_STEPS.length,
      missingSteps:
        attempt?.status === 'in_progress' ? missingSteps(responses) : [],
    };
  }

  async getMe(userId: string) {
    const [user, attempt, completed] = await Promise.all([
      this.usersService.findById(userId),
      this.getLatestAttempt(userId),
      this.getLatestCompleted(userId),
    ]);

    const result = completed;
    if (!result) {
      return {
        completed: false,
        travelType: user?.travelType ?? null,
        axes: user?.personalityAxes ?? null,
        preferences: user?.quizPreferences ?? null,
        stamina: null,
        responses: null,
        activeSessionId:
          attempt?.status === 'in_progress' ? attempt._id.toString() : null,
      };
    }

    const responses = (result.responses ?? {}) as QuizResponses;
    const stamina = resolveStaminaLevel({
      staminaLevel: responses.stamina?.level,
      staminaScore: responses.stamina?.score,
      birthYear: user?.birthYear,
      mobilityConstraints: user?.mobilityConstraints,
    });

    return {
      completed: true,
      sessionId: result._id.toString(),
      travelType: result.travelType ?? user?.travelType ?? null,
      axes: result.axes ?? user?.personalityAxes ?? null,
      preferences: result.preferences ?? user?.quizPreferences ?? null,
      stamina: {
        ...stamina,
        answer: responses.stamina?.answer ?? null,
      },
      responses,
      completedAt: result.completedAt,
      activeSessionId:
        attempt?.status === 'in_progress' ? attempt._id.toString() : null,
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
      isLatestCompleted: false,
    });

    return this.formatSession(session);
  }

  async patchSession(
    userId: string,
    sessionId: string,
    dto: PartialQuizResponsesDto,
  ) {
    const session = await this.findOwnedSession(userId, sessionId);
    if (session.status === 'completed') {
      throw new BadRequestException('이미 완료된 세션입니다.');
    }

    const merged = {
      ...(session.responses as object),
      ...this.stripUndefined(dto),
    } as QuizResponses;

    session.responses = merged;
    await session.save();
    return this.formatSession(session);
  }

  async completeSession(
    userId: string,
    sessionId: string,
    dto: QuizResponsesDto,
  ) {
    const session = await this.findOwnedSession(userId, sessionId);
    if (session.status === 'completed') {
      throw new BadRequestException('이미 완료된 세션입니다.');
    }

    // complete는 전체 QuizResponsesDto를 받음 (FE가 점수까지 계산)
    session.responses = this.stripUndefined(dto);

    const responses = session.responses as QuizResponses;
    if (!areAllStepsAnswered(responses)) {
      const missing = missingSteps(responses);
      throw new BadRequestException(
        `모든 테스트 챕터(${QUIZ_STEPS.length}개)를 완료해야 합니다. 부족한 챕터: ${missing.join(', ')}`,
      );
    }
    if (responses.surveyVersion == null || responses.algorithmVersion == null) {
      throw new BadRequestException(
        'surveyVersion과 algorithmVersion이 필요합니다.',
      );
    }

    const user = await this.usersService.findById(userId);
    const axes = computePersonalityAxes(responses);
    const travelType = deriveTravelType(axes, responses.challengeStyle?.type);
    const preferences = buildPreferences(responses);
    const stamina = resolveStaminaLevel({
      staminaLevel: responses.stamina?.level,
      staminaScore: responses.stamina?.score,
      birthYear: user?.birthYear,
      mobilityConstraints: user?.mobilityConstraints,
    });

    const userObjectId = new Types.ObjectId(userId);
    await this.testResultModel.updateMany(
      { userId: userObjectId, isLatestCompleted: true },
      { isLatestCompleted: false },
    );

    session.status = 'completed';
    session.axes = axes;
    session.preferences = preferences;
    session.travelType = travelType;
    session.completedAt = new Date();
    session.isLatest = true;
    session.isLatestCompleted = true;
    await session.save();

    const updatedUser = await this.usersService.updateById(userId, {
      travelType,
      quizPreferences: preferences,
      personalityAxes: axes,
    });
    await this.refreshRoomPreferenceSnapshots(userId, travelType, axes);

    return {
      sessionId: session._id.toString(),
      surveyVersion: responses.surveyVersion,
      algorithmVersion: responses.algorithmVersion,
      travelType,
      challengeStyleType: responses.challengeStyle?.type ?? null,
      axes,
      preferences,
      stamina: {
        ...stamina,
        answer: responses.stamina?.answer ?? null,
      },
      responses,
      user: updatedUser ? this.usersService.toPublicUser(updatedUser) : null,
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
    await this.testResultModel.updateMany(
      { userId: userObjectId, isLatestCompleted: true },
      { isLatestCompleted: false },
    );

    await this.testResultModel.create({
      userId: userObjectId,
      status: 'completed',
      answers,
      responses: { legacyAnswers: answers },
      travelType,
      isLatest: true,
      isLatestCompleted: true,
      completedAt: new Date(),
    });

    const user = await this.usersService.updateById(userId, { travelType });
    await this.refreshRoomPreferenceSnapshots(userId, travelType);
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
      missingSteps: missingSteps(responses),
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

  private async refreshRoomPreferenceSnapshots(
    userId: string,
    travelType: TravelType,
    personalityAxes?: {
      scheduleDensity: number;
      landmarkNecessity: number;
      localInterest: number;
      challenging: number;
    },
  ) {
    const userObjectId = new Types.ObjectId(userId);
    await this.roomModel.updateMany(
      { 'members.userId': userObjectId },
      {
        $set: {
          'members.$[member].travelTypeSnapshot': travelType,
          ...(personalityAxes
            ? {
                'members.$[member].personalityAxesSnapshot': personalityAxes,
              }
            : {}),
          'members.$[member].preferenceUpdatedAt': new Date(),
        },
        $inc: { factsVersion: 1 },
      },
      { arrayFilters: [{ 'member.userId': userObjectId }] },
    );
  }
}

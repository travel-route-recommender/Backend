import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import {
  QUIZ_QUESTIONS,
  calculateTravelType,
} from './quiz.data';

@Injectable()
export class QuizService {
  constructor(private readonly usersService: UsersService) {}

  getQuestions() {
    return QUIZ_QUESTIONS;
  }

  async getStatus(userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      completed: Boolean(user?.travelType),
      onboardingCompleted: user?.onboardingCompleted ?? false,
      answeredCount: Object.keys(user?.quizAnswers ?? {}).length,
      totalQuestions: QUIZ_QUESTIONS.length,
    };
  }

  async submit(userId: string, answers: Record<string, string>) {
    const travelType = calculateTravelType(answers);
    const user = await this.usersService.updateById(userId, {
      quizAnswers: answers,
      travelType,
    });
    return {
      travelType: user?.travelType,
      user: user ? this.usersService.toPublicUser(user) : null,
    };
  }
}

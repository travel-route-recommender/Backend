import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { QuizService } from './quiz.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@ApiTags('quiz')
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('questions')
  @ApiOperation({ summary: '두리 테스트 8문항 조회 (비인증)' })
  getQuestions() {
    return this.quizService.getQuestions();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiOperation({ summary: '퀴즈 진행 상태' })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.quizService.getStatus(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('submit')
  @ApiOperation({ summary: '답변 제출 → TravelType 계산' })
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitQuizDto) {
    return this.quizService.submit(user.userId, dto.answers);
  }
}

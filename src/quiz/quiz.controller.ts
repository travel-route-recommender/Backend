import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
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
import {
  QuizQuestionDto,
  QuizStatusDto,
  QuizSubmitResultDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('두리 테스트')
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('questions')
  @ApiOperation({
    summary: '두리 테스트 문항 조회',
    description:
      '8문항. 로그인 없이 조회 가능합니다. 제출(`/quiz/submit`)만 인증이 필요합니다.',
  })
  @ApiOkResponse({ type: QuizQuestionDto, isArray: true })
  getQuestions() {
    return this.quizService.getQuestions();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiOperation({
    summary: '테스트 진행·완료 상태',
    description:
      '이미 TravelType이 있는지, 최신 결과 요약을 확인할 때 사용합니다.',
  })
  @ApiOkResponse({ type: QuizStatusDto })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.quizService.getStatus(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('submit')
  @ApiOperation({
    summary: '답변 제출 → TravelType 결과',
    description:
      '결과를 저장하고 User.travelType 캐시를 갱신합니다. 재테스트도 가능합니다.',
  })
  @ApiOkResponse({ type: QuizSubmitResultDto })
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitQuizDto) {
    return this.quizService.submit(user.userId, dto.answers);
  }
}

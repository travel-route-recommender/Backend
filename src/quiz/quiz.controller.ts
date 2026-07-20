import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import {
  CompleteQuizSessionDto,
  PatchQuizSessionDto,
  SubmitQuizDto,
} from './dto/quiz-session.dto';
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
    summary: '테스트 스텝 목록 (문항 형태)',
    description:
      '프론트 안내용 스텝 메타입니다. 실제 응답은 `/quiz/sessions`로 저장하세요.',
  })
  @ApiOkResponse({ type: QuizQuestionDto, isArray: true })
  getQuestions() {
    return this.quizService.getQuestions();
  }

  @Get('steps')
  @ApiOperation({ summary: '테스트 스텝 메타 조회' })
  getSteps() {
    return this.quizService.getSteps();
  }

  @Get('tags')
  @ApiOperation({
    summary: '예산 소비 테스트용 태그/카테고리',
    description:
      '매장·장소 태그 API가 없으면 mock 데이터를 반환합니다. source=mock.',
  })
  getTags() {
    return this.quizService.getTags();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiOperation({ summary: '테스트 진행·완료 상태' })
  @ApiOkResponse({ type: QuizStatusDto })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.quizService.getStatus(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({
    summary: '내 최신 성향 조회',
    description: '완료된 테스트의 travelType · axes · preferences를 반환합니다.',
  })
  getMe(@CurrentUser() user: AuthUser) {
    return this.quizService.getMe(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  @ApiOperation({
    summary: '테스트 세션 생성',
    description: '새 in_progress 세션을 만들고 이전 isLatest를 해제합니다.',
  })
  createSession(@CurrentUser() user: AuthUser) {
    return this.quizService.createSession(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('sessions/:sessionId')
  @ApiOperation({
    summary: '응답 중간 저장',
    description: '보낸 responses 필드를 기존 세션에 merge합니다.',
  })
  patchSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: PatchQuizSessionDto,
  ) {
    return this.quizService.patchSession(
      user.userId,
      sessionId,
      dto.responses,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('sessions/:sessionId/complete')
  @ApiOperation({
    summary: '테스트 완료 → rule-based 성향 진단',
    description:
      '선택적으로 마지막 responses를 함께 보낼 수 있습니다. 4축 + TravelType + preferences 저장.',
  })
  completeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteQuizSessionDto,
  ) {
    return this.quizService.completeSession(
      user.userId,
      sessionId,
      dto?.responses,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('submit')
  @ApiOperation({
    summary: '[레거시] 한 방 제출',
    description: '신규 플로우는 `/quiz/sessions`를 사용하세요.',
    deprecated: true,
  })
  @ApiOkResponse({ type: QuizSubmitResultDto })
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitQuizDto) {
    return this.quizService.submit(user.userId, dto.answers);
  }
}

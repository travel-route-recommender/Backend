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
import { OnboardingService } from './onboarding.service';
import { SubmitOnboardingSurveyDto } from './dto/submit-onboarding-survey.dto';
import {
  OnboardingStatusDto,
  OnboardingSurveyDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('온보딩')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({
    summary: '온보딩 설문 완료 여부',
    description:
      '회원가입 직후 짧은 설문입니다. 두리 성향 테스트(`/quiz`)와는 별개예요.',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getStatus(user.userId);
  }

  @Get('survey')
  @ApiOperation({ summary: '내 온보딩 설문 응답 조회' })
  @ApiOkResponse({ type: OnboardingSurveyDto })
  getSurvey(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getSurvey(user.userId);
  }

  @Post('survey')
  @ApiOperation({
    summary: '온보딩 설문 제출',
    description:
      '면허·자차·이동 불편(계단/급경사/장도보)·출생연도·관심 태그. 재제출 시 덮어씁니다.',
  })
  @ApiOkResponse({ type: OnboardingSurveyDto })
  submitSurvey(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitOnboardingSurveyDto,
  ) {
    return this.onboardingService.submitSurvey(user.userId, dto);
  }
}

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
import { OnboardingService } from './onboarding.service';
import { SubmitOnboardingSurveyDto } from './dto/submit-onboarding-survey.dto';

@ApiTags('onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: '온보딩 설문 완료 여부' })
  getStatus(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getStatus(user.userId);
  }

  @Get('survey')
  @ApiOperation({ summary: '내 온보딩 설문 응답 조회' })
  getSurvey(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getSurvey(user.userId);
  }

  @Post('survey')
  @ApiOperation({ summary: '온보딩 설문 제출 (회원가입 후 간단 정보)' })
  submitSurvey(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitOnboardingSurveyDto,
  ) {
    return this.onboardingService.submitSurvey(user.userId, dto.answers);
  }
}

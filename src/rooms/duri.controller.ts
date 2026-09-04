import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { DuriService } from './duri.service';
import {
  AnalysisReportDto,
  MatchResultDto,
} from '../common/dto/swagger-responses.dto';
import { RateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('두리 도우미')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/duri')
@ApiParam({ name: 'roomId', example: '665abc123def456789012345' })
export class DuriController {
  constructor(private readonly duriService: DuriService) {}

  @Post('reflect-preferences')
  @ApiOperation({ summary: '멤버 취향 반영 (compatibility 재사용)' })
  @ApiOkResponse({ type: MatchResultDto })
  reflectPreferences(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.reflectPreferences(roomId, user.userId);
  }

  @Post('analysis-report')
  @RateLimit({ group: 'duri-analysis', limit: 6, windowMs: 60_000 })
  @ApiOperation({
    summary: '검증 가능한 데이터 기반 일정 리포트 생성',
    description:
      '같은 DAY의 인접 일정만 분석하며, 자동차 경로·시간 겹침·사용자 입력 선호처럼 근거가 있는 결과만 반환합니다.',
  })
  @ApiOkResponse({ type: AnalysisReportDto })
  createReport(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.duriService.generateAnalysisReport(roomId, user.userId);
  }

  @Get('analysis-report/latest')
  @ApiOperation({ summary: '최신 분석 리포트 조회' })
  @ApiOkResponse({ type: AnalysisReportDto })
  latestReport(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.duriService.getLatestReport(roomId, user.userId);
  }
}

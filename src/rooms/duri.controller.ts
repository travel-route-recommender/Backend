import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { OptimizeDto, ReplacePlaceDto } from './dto/room.dto';
import {
  AnalysisReportDto,
  DuriSuggestPlacesDto,
  MatchResultDto,
  RoomScheduleDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('두리 도우미')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/duri')
@ApiParam({ name: 'roomId', example: '665abc123def456789012345' })
export class DuriController {
  constructor(private readonly duriService: DuriService) {}

  @Post('suggest-places')
  @ApiOperation({
    summary: '장소 추천',
    description: '규칙 기반 MVP. 방 멤버 취향·후보를 참고해 장소를 제안합니다.',
  })
  @ApiOkResponse({ type: DuriSuggestPlacesDto })
  suggestPlaces(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.suggestPlaces(roomId, user.userId);
  }

  @Post('suggest-order')
  @ApiOperation({ summary: '일정 순서 제안' })
  suggestOrder(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.duriService.suggestOrder(roomId, user.userId);
  }

  @Post('fill-gaps')
  @ApiOperation({ summary: '빈 시간대 채우기' })
  fillGaps(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.duriService.fillGaps(roomId, user.userId);
  }

  @Post('replace-place')
  @ApiOperation({ summary: '일정 장소 대체 제안' })
  replacePlace(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ReplacePlaceDto,
  ) {
    return this.duriService.replacePlace(roomId, user.userId, dto);
  }

  @Post('reflect-preferences')
  @ApiOperation({ summary: '멤버 취향 반영 (compatibility 재사용)' })
  @ApiOkResponse({ type: MatchResultDto })
  reflectPreferences(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.reflectPreferences(roomId, user.userId);
  }

  @Post('optimize')
  @ApiOperation({ summary: '동선/예산 최적화' })
  optimize(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: OptimizeDto,
  ) {
    return this.duriService.optimize(roomId, user.userId, dto);
  }

  @Post('generate-draft')
  @ApiOperation({ summary: '일정 초안 생성' })
  @ApiOkResponse({ type: RoomScheduleDto })
  generateDraft(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.generateDraft(roomId, user.userId);
  }

  @Post('analysis-report')
  @ApiOperation({ summary: '분석 리포트 생성' })
  @ApiOkResponse({ type: AnalysisReportDto })
  createReport(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.generateAnalysisReport(roomId, user.userId);
  }

  @Get('analysis-report/latest')
  @ApiOperation({ summary: '최신 분석 리포트 조회' })
  @ApiOkResponse({ type: AnalysisReportDto })
  latestReport(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.duriService.getLatestReport(roomId, user.userId);
  }
}

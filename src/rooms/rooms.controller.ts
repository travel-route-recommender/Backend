import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RoomsService } from './rooms.service';
import {
  AddCandidateDto,
  BatchScheduleDto,
  CreateFromCompatibilityDto,
  CreateRoomDto,
  ReorderScheduleDto,
  ScheduleItemDto,
  ScheduleStyleDto,
  SelectCourseDto,
  UpdateDestinationDto,
  UpdateRoomDto,
  UpdateScheduleItemDto,
} from './dto/room.dto';

const ROOM_ID = { name: 'roomId', example: '665abc123def456789012345' };

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @ApiOperation({ summary: '여행방 생성' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(user.userId, dto);
  }

  @Post('from-compatibility')
  @ApiOperation({ summary: '궁합 멤버 목록으로 여행방 생성' })
  createFromCompatibility(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFromCompatibilityDto,
  ) {
    return this.roomsService.createFromCompatibility(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: '내 여행방 목록' })
  @ApiQuery({ name: 'status', required: false, enum: ['ongoing', 'completed'] })
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: 'ongoing' | 'completed',
  ) {
    return this.roomsService.listMyRooms(user.userId, status);
  }

  @Get(':roomId')
  @ApiOperation({ summary: '여행방 상세' })
  @ApiParam(ROOM_ID)
  getRoom(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getRoom(roomId, user.userId);
  }

  @Get(':roomId/summary')
  @ApiOperation({ summary: '여행방 요약 (목록용)' })
  @ApiParam(ROOM_ID)
  getSummary(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getSummary(roomId, user.userId);
  }

  @Patch(':roomId')
  @ApiOperation({ summary: '여행방 수정 (title, dates, status)' })
  @ApiParam(ROOM_ID)
  updateRoom(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(roomId, user.userId, dto);
  }

  @Patch(':roomId/destination')
  @ApiOperation({ summary: '여행지 설정' })
  @ApiParam(ROOM_ID)
  updateDestination(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.roomsService.updateDestination(roomId, user.userId, dto);
  }

  @Get(':roomId/progress')
  @ApiOperation({ summary: '여행방 진행률 (5단계 heuristic)' })
  @ApiParam(ROOM_ID)
  getProgress(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getProgress(roomId, user.userId);
  }

  @Get(':roomId/invite-link')
  @ApiOperation({ summary: '초대 링크 조회' })
  @ApiParam(ROOM_ID)
  getInviteLink(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getInviteLink(roomId, user.userId);
  }

  @Post(':roomId/invites')
  @ApiOperation({ summary: '초대코드 재발급 (owner만)' })
  @ApiParam(ROOM_ID)
  regenerateInvite(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.regenerateInvite(roomId, user.userId);
  }

  @Get(':roomId/workspace')
  @ApiOperation({ summary: '두리 워크스페이스 (room + candidates + schedule)' })
  @ApiParam(ROOM_ID)
  getWorkspace(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getWorkspace(roomId, user.userId);
  }

  @Get(':roomId/compatibility')
  @ApiOperation({ summary: '멤버 궁합 점수 (2인 tag intersection)' })
  @ApiParam(ROOM_ID)
  getCompatibility(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getCompatibility(roomId, user.userId);
  }

  @Get(':roomId/match-result')
  @ApiOperation({ summary: '궁합 결과 (compatibility와 동일)' })
  @ApiParam(ROOM_ID)
  getMatchResult(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getMatchResult(roomId, user.userId);
  }

  @Get(':roomId/adjustment-plan')
  @ApiOperation({ summary: '일정 조율 제안 (rule-based)' })
  @ApiParam(ROOM_ID)
  getAdjustmentPlan(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getAdjustmentPlan(roomId, user.userId);
  }

  @Get(':roomId/courses')
  @ApiOperation({ summary: '추천 코스 목록' })
  @ApiParam(ROOM_ID)
  getCourses(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getCourses(roomId, user.userId);
  }

  @Patch(':roomId/schedule-style')
  @ApiOperation({ summary: 'J/P 일정 스타일 설정' })
  @ApiParam(ROOM_ID)
  setScheduleStyle(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ScheduleStyleDto,
  ) {
    return this.roomsService.setScheduleStyle(roomId, user.userId, dto.style);
  }

  @Patch(':roomId/courses/selected')
  @ApiOperation({ summary: '코스 선택 저장' })
  @ApiParam(ROOM_ID)
  selectCourse(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: SelectCourseDto,
  ) {
    return this.roomsService.selectCourse(roomId, user.userId, dto.courseId);
  }

  @Get(':roomId/candidates')
  @ApiOperation({ summary: '후보 장소 목록' })
  @ApiParam(ROOM_ID)
  listCandidates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.listCandidates(roomId, user.userId);
  }

  @Get(':roomId/candidates/by-member')
  @ApiOperation({ summary: '멤버별 후보 장소' })
  @ApiParam(ROOM_ID)
  candidatesByMember(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.candidatesByMember(roomId, user.userId);
  }

  @Get(':roomId/candidates/common')
  @ApiOperation({ summary: '2명 이상 공통 후보' })
  @ApiParam(ROOM_ID)
  commonCandidates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.commonCandidates(roomId, user.userId);
  }

  @Get(':roomId/candidates/explore')
  @ApiOperation({ summary: '탐색용 후보 목록' })
  @ApiParam(ROOM_ID)
  exploreCandidates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.listCandidates(roomId, user.userId);
  }

  @Post(':roomId/candidates')
  @ApiOperation({ summary: '후보 장소 추가' })
  @ApiParam(ROOM_ID)
  addCandidate(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: AddCandidateDto,
  ) {
    return this.roomsService.addCandidate(roomId, user.userId, dto);
  }

  @Delete(':roomId/candidates/:placeId')
  @ApiOperation({ summary: '본인 후보 삭제' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'placeId', example: '665abc123def456789012345' })
  removeCandidate(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('placeId') placeId: string,
  ) {
    return this.roomsService.removeCandidate(roomId, user.userId, placeId);
  }

  @Get(':roomId/schedule')
  @ApiOperation({ summary: '전체 일정 조회' })
  @ApiParam(ROOM_ID)
  getSchedule(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getSchedule(roomId, user.userId);
  }

  @Get(':roomId/schedule/map')
  @ApiOperation({ summary: '지도용 flat 일정 items' })
  @ApiParam(ROOM_ID)
  getScheduleMap(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getScheduleMap(roomId, user.userId);
  }

  @Get(':roomId/schedule/summary')
  @ApiOperation({ summary: '일정 요약 (태그/일별)' })
  @ApiParam(ROOM_ID)
  getScheduleSummary(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getScheduleSummary(roomId, user.userId);
  }

  @Post(':roomId/schedule/items')
  @ApiOperation({ summary: '일정 항목 추가' })
  @ApiParam(ROOM_ID)
  addScheduleItem(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ScheduleItemDto,
  ) {
    return this.roomsService.addScheduleItem(roomId, user.userId, dto);
  }

  @Patch(':roomId/schedule/reorder')
  @ApiOperation({ summary: '일정 순서 변경 (drag-drop)' })
  @ApiParam(ROOM_ID)
  reorderSchedule(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ReorderScheduleDto,
  ) {
    return this.roomsService.reorderSchedule(roomId, user.userId, dto);
  }

  @Patch(':roomId/schedule/items/:itemId')
  @ApiOperation({ summary: '일정 항목 수정' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  updateScheduleItem(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateScheduleItemDto,
  ) {
    return this.roomsService.updateScheduleItem(
      roomId,
      user.userId,
      itemId,
      dto,
    );
  }

  @Delete(':roomId/schedule/items/:itemId')
  @ApiOperation({ summary: '일정 항목 삭제' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  deleteScheduleItem(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.roomsService.deleteScheduleItem(roomId, user.userId, itemId);
  }

  @Put(':roomId/schedule')
  @ApiOperation({ summary: '일정 batch 저장' })
  @ApiParam(ROOM_ID)
  saveSchedule(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: BatchScheduleDto,
  ) {
    return this.roomsService.saveSchedule(roomId, user.userId, dto);
  }
}

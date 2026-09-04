import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RoomsService } from './rooms.service';
import {
  AddCandidateDto,
  ApplyScheduleProposalDto,
  BatchScheduleDto,
  CreateFromCompatibilityDto,
  CreateRoomDto,
  LockScheduleItemDto,
  ReorderScheduleDto,
  ScheduleItemDto,
  ScheduleStyleDto,
  UpdateDestinationDto,
  UpdatePlanningDto,
  UpdateRoomDto,
  UpdateScheduleItemDto,
  UpdateTripDatesDto,
  UploadTicketDto,
  UpsertCandidateSignalDto,
  UpsertReservationDto,
} from './dto/room.dto';
import {
  CandidateDto,
  InviteLinkDto,
  ItineraryItemDto,
  MatchResultDto,
  OngoingTripDto,
  PlaceDto,
  RoomDto,
  RoomProgressDto,
  RoomScheduleDto,
  ScheduleMapDto,
  ScheduleSummaryDto,
  ScheduleTicketDto,
  ScheduleTicketListDto,
  SuccessDto,
  WorkspaceDto,
} from '../common/dto/swagger-responses.dto';
import { TICKET_MAX_BYTES } from '../common/storage/local-upload.service';
const ROOM_ID = { name: 'roomId', example: '665abc123def456789012345' };

@ApiTags('여행방')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @ApiOperation({ summary: '여행방 생성' })
  @ApiCreatedResponse({ type: RoomDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(user.userId, dto);
  }

  @Post('from-compatibility')
  @ApiOperation({ summary: '궁합 멤버 목록으로 여행방 생성' })
  @ApiCreatedResponse({ type: RoomDto })
  createFromCompatibility(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFromCompatibilityDto,
  ) {
    return this.roomsService.createFromCompatibility(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: '내 여행방 목록' })
  @ApiQuery({ name: 'status', required: false, enum: ['ongoing', 'completed'] })
  @ApiOkResponse({ type: OngoingTripDto, isArray: true })
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: 'ongoing' | 'completed',
  ) {
    return this.roomsService.listMyRooms(user.userId, status);
  }

  @Get(':roomId')
  @ApiOperation({ summary: '여행방 상세' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: RoomDto })
  getRoom(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getRoom(roomId, user.userId);
  }

  @Get(':roomId/summary')
  @ApiOperation({ summary: '여행방 요약 (목록용)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: OngoingTripDto })
  getSummary(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getSummary(roomId, user.userId);
  }

  @Patch(':roomId')
  @ApiOperation({ summary: '여행방 수정 (title, dates, status)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: RoomDto })
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
  @ApiOkResponse({ type: RoomDto })
  updateDestination(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.roomsService.updateDestination(roomId, user.userId, dto);
  }

  @Get(':roomId/progress')
  @ApiOperation({ summary: '여행 준비 5단계 진행률' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: RoomProgressDto })
  getProgress(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getProgress(roomId, user.userId);
  }

  @Get(':roomId/invite-link')
  @ApiOperation({ summary: '초대 링크 조회' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: InviteLinkDto })
  getInviteLink(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getInviteLink(roomId, user.userId);
  }

  @Post(':roomId/invites')
  @ApiOperation({ summary: '초대코드 재발급 (owner만)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: InviteLinkDto })
  regenerateInvite(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.regenerateInvite(roomId, user.userId);
  }

  @Get(':roomId/workspace')
  @ApiOperation({ summary: '두리 워크스페이스 (room + candidates + schedule)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: WorkspaceDto })
  getWorkspace(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getWorkspace(roomId, user.userId);
  }

  @Get(':roomId/compatibility')
  @ApiOperation({ summary: '멤버 궁합 점수 (N명 pairwise tag 평균)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: MatchResultDto })
  getCompatibility(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getCompatibility(roomId, user.userId);
  }

  @Get(':roomId/match-result')
  @ApiOperation({ summary: '궁합 결과 (compatibility와 동일)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: MatchResultDto })
  getMatchResult(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getMatchResult(roomId, user.userId);
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

  @Get(':roomId/candidates')
  @ApiOperation({ summary: '후보 장소 목록' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: CandidateDto, isArray: true })
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
  @ApiOkResponse({ type: PlaceDto, isArray: true })
  commonCandidates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.commonCandidates(roomId, user.userId);
  }

  @Get(':roomId/candidates/explore')
  @ApiOperation({ summary: '탐색용 후보 목록' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: CandidateDto, isArray: true })
  exploreCandidates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.listCandidates(roomId, user.userId);
  }

  @Post(':roomId/candidates')
  @ApiOperation({
    summary: '후보 장소 추가',
    description:
      '`placeId`(Mongo) **또는** `tourContentId`(TourAPI) 중 하나만 넘기면 됩니다.\n\n' +
      '- TourAPI 검색/목록 결과 → `tourContentId` (+ 선택 `contentTypeId`)만으로 추가 가능\n' +
      '- 이미 DB에 있는 장소 → `placeId` 사용\n\n' +
      '둘 다 없으면 400.',
  })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: CandidateDto, isArray: true })
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
  @ApiOkResponse({ type: SuccessDto })
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
  @ApiOkResponse({ type: RoomScheduleDto })
  getSchedule(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService.getSchedule(roomId, user.userId);
  }

  @Get(':roomId/schedule/map')
  @ApiOperation({ summary: '지도용 flat 일정 items' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: ScheduleMapDto })
  getScheduleMap(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getScheduleMap(roomId, user.userId);
  }

  @Get(':roomId/schedule/summary')
  @ApiOperation({ summary: '일정 요약 (태그/일별)' })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: ScheduleSummaryDto })
  getScheduleSummary(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getScheduleSummary(roomId, user.userId);
  }

  @Post(':roomId/schedule/items')
  @ApiOperation({
    summary: '일정 항목 추가',
    description:
      'body.expectedVersion 필수. 충돌 시 409 SCHEDULE_VERSION_CONFLICT',
  })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: ItineraryItemDto })
  addScheduleItem(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ScheduleItemDto,
  ) {
    return this.roomsService.addScheduleItem(roomId, user.userId, dto);
  }

  @Patch(':roomId/schedule/reorder')
  @ApiOperation({ summary: '일정 순서 변경 (expectedVersion 필수)' })
  @ApiParam(ROOM_ID)
  reorderSchedule(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ReorderScheduleDto,
  ) {
    return this.roomsService.reorderSchedule(roomId, user.userId, dto);
  }

  @Patch(':roomId/schedule/items/:itemId')
  @ApiOperation({
    summary: '일정 항목 수정',
    description:
      'expectedVersion 필수. 잠긴 항목은 unlock=true 필요. placeId 변경 시 기존 티켓·예약 비승계.',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiOkResponse({ type: ItineraryItemDto })
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
  @ApiOperation({ summary: '일정 항목 삭제 (query expectedVersion 필수)' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiQuery({ name: 'expectedVersion', required: true, example: '0' })
  @ApiQuery({ name: 'unlock', required: false, example: 'false' })
  @ApiQuery({ name: 'clientMutationId', required: false })
  @ApiOkResponse({ type: SuccessDto })
  deleteScheduleItem(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
    @Query('unlock') unlock?: string,
    @Query('clientMutationId') clientMutationId?: string,
  ) {
    return this.roomsService.deleteScheduleItem(
      roomId,
      user.userId,
      itemId,
      expectedVersion,
      clientMutationId,
      unlock === 'true' || unlock === '1',
    );
  }

  @Patch(':roomId/schedule/items/:itemId/lock')
  @ApiOperation({ summary: '일정 항목 잠금/해제' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  setScheduleItemLock(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Body() dto: LockScheduleItemDto,
  ) {
    return this.roomsService.setScheduleItemLock(
      roomId,
      user.userId,
      itemId,
      dto,
    );
  }

  @Put(':roomId/schedule/items/:itemId/reservation')
  @ApiOperation({
    summary: '확정 예약 upsert (구조화)',
    description: 'OCR 결과는 FE. 사용자가 확인한 예약만 공유 저장.',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  upsertReservation(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpsertReservationDto,
  ) {
    return this.roomsService.upsertReservation(
      roomId,
      user.userId,
      itemId,
      dto,
    );
  }

  @Delete(':roomId/schedule/items/:itemId/reservation')
  @ApiOperation({ summary: '확정 예약 삭제' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiQuery({ name: 'expectedVersion', required: true })
  deleteReservation(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
    @Query('clientMutationId') clientMutationId?: string,
  ) {
    return this.roomsService.deleteReservation(
      roomId,
      user.userId,
      itemId,
      expectedVersion,
      clientMutationId,
    );
  }

  @Get(':roomId/schedule/items/:itemId/tickets')
  @ApiOperation({ summary: '일정 항목 입장권 목록' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiOkResponse({ type: ScheduleTicketListDto })
  listScheduleTickets(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.roomsService.listScheduleTickets(roomId, user.userId, itemId);
  }

  @Post(':roomId/schedule/items/:itemId/tickets')
  @ApiOperation({
    summary: '일정 항목 입장권 사진 업로드',
    description:
      'multipart: image(필수), expectedVersion(필수), note?, clientMutationId?',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'expectedVersion'],
      properties: {
        image: { type: 'string', format: 'binary' },
        expectedVersion: { type: 'integer', example: 0 },
        note: { type: 'string', example: '사전 예매 QR' },
        clientMutationId: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: ScheduleTicketDto })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: TICKET_MAX_BYTES },
    }),
  )
  uploadScheduleTicket(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTicketDto,
  ) {
    return this.roomsService.uploadScheduleTicket(
      roomId,
      user.userId,
      itemId,
      file,
      dto.note,
      dto.expectedVersion,
      dto.clientMutationId,
    );
  }

  @Delete(':roomId/schedule/items/:itemId/tickets/:ticketId')
  @ApiOperation({ summary: '일정 항목 입장권 삭제' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'itemId', example: 'item-1' })
  @ApiParam({
    name: 'ticketId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({ name: 'expectedVersion', required: true })
  @ApiOkResponse({ type: SuccessDto })
  deleteScheduleTicket(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('itemId') itemId: string,
    @Param('ticketId') ticketId: string,
    @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
    @Query('clientMutationId') clientMutationId?: string,
  ) {
    return this.roomsService.deleteScheduleTicket(
      roomId,
      user.userId,
      itemId,
      ticketId,
      expectedVersion,
      clientMutationId,
    );
  }

  @Put(':roomId/schedule')
  @ApiOperation({
    summary: '일정 batch 저장',
    description: 'expectedVersion 필수. 조건부 쓰기. 잠긴 항목 무단 변경 거부.',
  })
  @ApiParam(ROOM_ID)
  @ApiOkResponse({ type: RoomScheduleDto })
  saveSchedule(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: BatchScheduleDto,
  ) {
    return this.roomsService.saveSchedule(roomId, user.userId, dto);
  }

  @Get(':roomId/planning')
  @ApiOperation({ summary: '숙소·복귀·이동수단·여유시간·timezone 조회' })
  @ApiParam(ROOM_ID)
  getPlanning(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.roomsService
      .getSchedule(roomId, user.userId)
      .then((s) => s.planning);
  }

  @Patch(':roomId/planning')
  @ApiOperation({
    summary: '숙소·복귀·이동수단·여유시간·timezone 수정',
    description: 'versioned 필드는 수정자·version·optional confirm',
  })
  @ApiParam(ROOM_ID)
  updatePlanning(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdatePlanningDto,
  ) {
    return this.roomsService.updatePlanning(roomId, user.userId, dto);
  }

  @Patch(':roomId/trip-dates')
  @ApiOperation({
    summary: '여행 날짜 원자 변경',
    description:
      'startDate/endDate와 일정 move/delete를 한 조건부 커밋으로 저장. expectedVersion 필수.',
  })
  @ApiParam(ROOM_ID)
  updateTripDates(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateTripDatesDto,
  ) {
    return this.roomsService.updateTripDates(roomId, user.userId, dto);
  }

  @Post(':roomId/schedule/apply')
  @ApiOperation({
    summary: '일정 제안 원자 적용',
    description:
      'batch 저장과 동일 + 잠금/예약 재검사. expectedFactsVersion 불일치 시 409.',
  })
  @ApiParam(ROOM_ID)
  applySchedule(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ApplyScheduleProposalDto,
  ) {
    return this.roomsService.applyScheduleProposal(roomId, user.userId, dto);
  }

  @Get(':roomId/analysis-baseline')
  @ApiOperation({
    summary: '분석/제안용 기준 스냅샷',
    description: 'scheduleVersion + factsVersion + 기간·planning',
  })
  @ApiParam(ROOM_ID)
  analysisBaseline(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getAnalysisBaseline(roomId, user.userId);
  }

  @Get(':roomId/preferences')
  @ApiOperation({
    summary: '참여자 성향 파생값 공유',
    description:
      '원본 퀴즈 답변 미포함. 미응답 axes/선호는 null (0으로 채우지 않음).',
  })
  @ApiParam(ROOM_ID)
  getPreferences(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getMemberPreferences(roomId, user.userId);
  }

  @Post(':roomId/preferences/refresh-constraints')
  @ApiOperation({
    summary: '내 이동제약 스냅샷 새로고침',
    description:
      '유저 프로필 mobilityConstraints → 방 멤버 스냅샷 + factsVersion++',
  })
  @ApiParam(ROOM_ID)
  refreshConstraints(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.refreshMyConstraints(roomId, user.userId);
  }

  @Put(':roomId/candidates/:placeId/signals')
  @ApiOperation({
    summary: '후보 장소 멤버 선호 신호 upsert',
    description:
      'mustVisit/avoid/preferenceStrength(1–5). 미전달 필드는 미응답 유지.',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'placeId' })
  upsertSignal(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('placeId') placeId: string,
    @Body() dto: UpsertCandidateSignalDto,
  ) {
    return this.roomsService.upsertCandidateSignal(
      roomId,
      user.userId,
      placeId,
      dto,
    );
  }
}

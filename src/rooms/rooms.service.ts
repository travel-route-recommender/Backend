import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { customAlphabet } from 'nanoid';
import {
  TravelRoom,
  TravelRoomDocument,
  ItineraryItem,
  ScheduleTicket,
  ConfirmedReservation,
} from '../schemas/travel-room.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { Place, PlaceDocument } from '../schemas/place.schema';
import {
  AddCandidateDto,
  ApplyScheduleProposalDto,
  BatchScheduleDto,
  CreateFromCompatibilityDto,
  CreateRoomDto,
  LockScheduleItemDto,
  ReorderScheduleDto,
  ScheduleItemDto,
  UpdateDestinationDto,
  UpdatePlanningDto,
  UpdateRoomDto,
  UpdateScheduleItemDto,
  UpdateTripDatesDto,
  UpsertCandidateSignalDto,
  UpsertReservationDto,
} from './dto/room.dto';
import {
  buildAdjustmentPlan,
  buildCourses,
  calculateMatchResult,
} from '../quiz/quiz.data';
import { TourService } from '../tour/tour.service';
import {
  assertNoOverlap,
  assertTimeRange,
  dateToDay,
  dayToDate,
  resolveItemDayAndDate,
  tripDayCount,
} from './schedule.validation';
import {
  LocalUploadService,
  TICKET_MAX_PER_ITEM,
} from '../common/storage/local-upload.service';
import { fromMongoPlace } from '../common/place/common-place';
import {
  assertNotLocked,
  fromAnchorDto,
  planningSnapshot,
  scheduleConflict,
  serializeScheduleItem,
  setVersionedValue,
  ticketsForPlaceChange,
  toReservationDto,
} from './schedule.helpers';
import { RoomTodosService } from './room-todos.service';
import { SignedUrlService } from '../common/storage/signed-url.service';
import {
  assertRoomMember,
  assertRoomOwner,
  requireRoom,
} from './room-access';

const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private config: ConfigService,
    private tourService: TourService,
    private uploads: LocalUploadService,
    private todosService: RoomTodosService,
    private signedUrls: SignedUrlService,
  ) {}

  private inviteLink(code: string) {
    const base = this.config.get('INVITE_LINK_BASE', 'tripmatch://invite');
    return `${base}/${code}`;
  }

  private async getRoomForMember(roomId: string, userId: string) {
    const room = requireRoom(await this.roomModel.findById(roomId));
    assertRoomMember(room, userId);
    return room;
  }

  private async getRoomForOwner(roomId: string, userId: string) {
    const room = requireRoom(await this.roomModel.findById(roomId));
    assertRoomOwner(room, userId);
    return room;
  }

  private computeProgress(room: TravelRoomDocument) {
    let step = 0;
    if (room.destination?.name) step += 1;
    if (room.startDate && room.endDate) step += 1;
    if (room.members.length > 1) step += 1;
    if (room.candidatePlaces.length > 0) step += 1;
    const itemCount = room.schedule.days.reduce(
      (acc, d) => acc + d.items.length,
      0,
    );
    if (itemCount > 0) step += 1;

    const percent = Math.min(100, Math.round((step / 5) * 100));
    const labels = ['시작 전', '여행지 설정', '일정 설정', '동행자 초대', '후보 수집', '일정 작성'];
    return {
      label: labels[step] ?? '진행 중',
      currentStep: step,
      percent,
    };
  }

  private toOngoingTrip(room: TravelRoomDocument) {
    const progress = this.computeProgress(room);
    const memberCount = room.members.length;
    const durationDays = tripDayCount(room.startDate, room.endDate);
    const destinationName = room.destination?.name;

    return {
      id: room._id.toString(),
      title: room.title,
      destination: destinationName ?? '미정',
      status: room.status,
      progressLabel: progress.label,
      lastUpdated:
        (room as unknown as { updatedAt: Date }).updatedAt?.toISOString?.() ??
        '',
      summary: destinationName
        ? `${destinationName} 여행 계획`
        : '여행 계획을 시작해보세요',
      currentStep: progress.currentStep,
      startDate: room.startDate?.toISOString?.() ?? null,
      endDate: room.endDate?.toISOString?.() ?? null,
      memberCount,
      durationDays,
      candidateCount: room.candidatePlaces.length,
    };
  }

  async create(userId: string, dto: CreateRoomDto) {
    const user = await this.userModel.findById(userId);
    const inviteCode = generateInviteCode();

    const room = await this.roomModel.create({
      title: dto.title ?? '새 여행방',
      createdBy: new Types.ObjectId(userId),
      inviteCode,
      inviteLink: this.inviteLink(inviteCode),
      members: [
        {
          userId: new Types.ObjectId(userId),
          role: 'owner',
          joinedAt: new Date(),
          travelTypeSnapshot: user?.travelType,
          mobilityConstraints: this.snapshotConstraints(user),
          preferenceUpdatedAt: user?.personalityAxes ? new Date() : undefined,
        },
      ],
      progress: { label: '시작 전', currentStep: 0, percent: 0 },
      factsVersion: 0,
    });

    return this.formatRoom(room);
  }

  async createFromCompatibility(userId: string, dto: CreateFromCompatibilityDto) {
    const memberIds = [userId, ...dto.memberUserIds.filter((id) => id !== userId)];
    const users = await this.userModel.find({ _id: { $in: memberIds } });
    const inviteCode = generateInviteCode();

    const room = await this.roomModel.create({
      title: dto.title ?? '궁합 멤버 여행방',
      createdBy: new Types.ObjectId(userId),
      inviteCode,
      inviteLink: this.inviteLink(inviteCode),
      members: users.map((u) => ({
        userId: u._id,
        role: u._id.toString() === userId ? 'owner' : 'member',
        joinedAt: new Date(),
        travelTypeSnapshot: u.travelType,
        mobilityConstraints: this.snapshotConstraints(u),
        preferenceUpdatedAt: u.personalityAxes ? new Date() : undefined,
      })),
      factsVersion: 0,
    });

    return this.formatRoom(room);
  }

  async listMyRooms(userId: string, status?: 'ongoing' | 'completed') {
    const filter: Record<string, unknown> = {
      'members.userId': new Types.ObjectId(userId),
    };
    if (status) filter.status = status;

    const rooms = await this.roomModel.find(filter).sort({ updatedAt: -1 });
    return rooms.map((r) => this.toOngoingTrip(r));
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return this.formatRoom(room);
  }

  async getSummary(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return this.toOngoingTrip(room);
  }

  async updateRoom(roomId: string, userId: string, dto: UpdateRoomDto) {
    const room = await this.getRoomForOwner(roomId, userId);
    if (dto.title) room.title = dto.title;
    if (dto.startDate) room.startDate = new Date(dto.startDate);
    if (dto.endDate) room.endDate = new Date(dto.endDate);
    if (dto.status) room.status = dto.status;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  async updateDestination(roomId: string, userId: string, dto: UpdateDestinationDto) {
    const room = await this.getRoomForOwner(roomId, userId);
    room.destination = dto;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  async regenerateInvite(roomId: string, userId: string) {
    const room = await this.getRoomForOwner(roomId, userId);

    room.inviteCode = generateInviteCode();
    room.inviteLink = this.inviteLink(room.inviteCode);
    await room.save();
    return { inviteCode: room.inviteCode, inviteLink: room.inviteLink };
  }

  async getInviteLink(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return { inviteCode: room.inviteCode, inviteLink: room.inviteLink };
  }

  async acceptInvite(code: string, userId: string) {
    const room = await this.roomModel.findOne({ inviteCode: code });
    if (!room) throw new NotFoundException('Invalid invite code');

    const already = room.members.some((m) => m.userId.toString() === userId);
    if (already) return this.formatRoom(room);

    const user = await this.userModel.findById(userId);
    room.members.push({
      userId: new Types.ObjectId(userId),
      role: 'member',
      joinedAt: new Date(),
      travelTypeSnapshot: user?.travelType,
      mobilityConstraints: this.snapshotConstraints(user),
      preferenceUpdatedAt: user?.personalityAxes ? new Date() : undefined,
    });
    room.factsVersion = (room.factsVersion ?? 0) + 1;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  private snapshotConstraints(user: UserDocument | null | undefined) {
    if (!user) {
      return {
        values: [] as string[],
        status: 'missing' as const,
        source: 'user',
        version: 1,
        updatedAt: new Date(),
      };
    }
    const values = user.mobilityConstraints ?? [];
    return {
      values,
      status: (values.length ? 'present' : 'missing') as 'present' | 'missing',
      source: 'user',
      version: 1,
      updatedAt: new Date(),
    };
  }

  /** 초대 링크 미리보기 (비인증, 읽기 전용) */
  async getInvitePreview(code: string) {
    const room = await this.roomModel.findOne({ inviteCode: code });
    if (!room) throw new NotFoundException('Invalid invite code');

    const ownerMember = room.members.find((m) => m.role === 'owner');
    const owner = ownerMember
      ? await this.userModel.findById(ownerMember.userId)
      : null;
    const durationDays = tripDayCount(room.startDate, room.endDate);

    return {
      inviteCode: room.inviteCode,
      title: room.title,
      destination: room.destination?.name ?? null,
      startDate: room.startDate?.toISOString?.() ?? null,
      endDate: room.endDate?.toISOString?.() ?? null,
      durationDays,
      memberCount: room.members.length,
      ownerNickname: owner?.nickname ?? null,
      status: room.status,
      previewText: this.buildInvitePreviewText(room, owner?.nickname),
    };
  }

  private buildInvitePreviewText(
    room: TravelRoomDocument,
    ownerNickname?: string | null,
  ) {
    const dest = room.destination?.name ?? '여행';
    const days = tripDayCount(room.startDate, room.endDate);
    const period =
      room.startDate && room.endDate
        ? `${this.formatKoDate(room.startDate)} ~ ${this.formatKoDate(room.endDate)}`
        : '일정 미정';
    const stay = days ? `${days - 1}박 ${days}일` : '';
    const headline = stay
      ? `${dest} ${stay} 여행에 초대받았어요`
      : `${dest} 여행에 초대받았어요`;

    return {
      headline,
      destination: dest,
      period,
      memberCount: room.members.length,
      ownerNickname: ownerNickname ?? '방장',
    };
  }

  private formatKoDate(date: Date) {
    const d = new Date(date);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  async getProgress(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return this.computeProgress(room);
  }

  async getWorkspace(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const placeIds = room.candidatePlaces.map((c) => c.placeId);
    const places = await this.placeModel.find({ _id: { $in: placeIds } });

    return {
      room: this.formatRoom(room),
      candidates: room.candidatePlaces.map((c) => ({
        placeId: c.placeId.toString(),
        addedBy: c.addedBy.toString(),
        addedAt: c.addedAt,
        note: c.note,
        scheduled: c.scheduled,
        place: places.find((p) => p._id.toString() === c.placeId.toString()),
      })),
      schedulePreview: room.schedule,
    };
  }

  async listCandidates(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const placeIds = room.candidatePlaces.map((c) => c.placeId);
    const places = await this.placeModel.find({ _id: { $in: placeIds } });
    const placeMap = new Map(
      places.map((p) => [p._id.toString(), fromMongoPlace(p)] as const),
    );
    return room.candidatePlaces.map((c) => ({
      placeId: c.placeId.toString(),
      addedBy: c.addedBy.toString(),
      addedAt: c.addedAt,
      note: c.note,
      scheduled: c.scheduled,
      place: placeMap.get(c.placeId.toString()),
    }));
  }

  async candidatesByMember(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const grouped: Record<string, string[]> = {};

    for (const c of room.candidatePlaces) {
      const key = c.addedBy.toString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c.placeId.toString());
    }

    const allIds = [...new Set(Object.values(grouped).flat())];
    const places = await this.placeModel.find({ _id: { $in: allIds } });
    const placeMap = Object.fromEntries(
      places.map((p) => [p._id.toString(), fromMongoPlace(p)]),
    );

    const result: Record<string, unknown[]> = {};
    for (const [memberId, ids] of Object.entries(grouped)) {
      result[memberId] = ids.map((id) => placeMap[id]).filter(Boolean);
    }
    return result;
  }

  async commonCandidates(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const byPlace: Record<string, Set<string>> = {};

    for (const c of room.candidatePlaces) {
      const pid = c.placeId.toString();
      if (!byPlace[pid]) byPlace[pid] = new Set();
      byPlace[pid].add(c.addedBy.toString());
    }

    const commonIds = Object.entries(byPlace)
      .filter(([, members]) => members.size >= 2)
      .map(([placeId]) => placeId);

    const places = await this.placeModel.find({ _id: { $in: commonIds } });
    return places.map((p) => fromMongoPlace(p));
  }

  async addCandidate(roomId: string, userId: string, dto: AddCandidateDto) {
    const room = await this.getRoomForMember(roomId, userId);

    // placeId 직접 지정 또는 TourAPI contentId로 upsert 후 placeId 확보.
    let placeId = dto.placeId;
    if (!placeId) {
      if (!dto.tourContentId) {
        throw new BadRequestException('placeId or tourContentId is required');
      }
      placeId = await this.tourService.resolvePlaceId(
        dto.tourContentId,
        dto.contentTypeId,
      );
    }

    const place = await this.placeModel.findById(placeId);
    if (!place) throw new NotFoundException('Place not found');

    const exists = room.candidatePlaces.some(
      (c) => c.placeId.toString() === placeId && c.addedBy.toString() === userId,
    );
    if (!exists) {
      room.candidatePlaces.push({
        placeId: new Types.ObjectId(placeId),
        addedBy: new Types.ObjectId(userId),
        addedAt: new Date(),
        note: dto.note,
        scheduled: false,
        memberSignals: [],
      });
      room.factsVersion = (room.factsVersion ?? 0) + 1;
      room.progress = this.computeProgress(room);
      await room.save();
    }
    return this.listCandidates(roomId, userId);
  }

  async removeCandidate(roomId: string, userId: string, placeId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    room.candidatePlaces = room.candidatePlaces.filter(
      (c) =>
        !(
          c.placeId.toString() === placeId &&
          c.addedBy.toString() === userId
        ),
    );
    room.progress = this.computeProgress(room);
    await room.save();
    return { success: true };
  }

  async getSchedule(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return {
      days: (room.schedule.days ?? []).map((d) => ({
        day: d.day,
        items: d.items.map((i) => serializeScheduleItem(i)),
      })),
      scheduleVersion: room.scheduleVersion ?? 0,
      planning: planningSnapshot(room),
    };
  }

  async getScheduleMap(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const items = room.schedule.days.flatMap((d) =>
      d.items.map((item) => ({ ...serializeScheduleItem(item), day: d.day })),
    );
    return {
      items,
      scheduleVersion: room.scheduleVersion ?? 0,
      planning: planningSnapshot(room),
    };
  }

  /**
   * Conditional schedule commit: membership + expectedVersion in filter.
   * Side-effect file deletes run only after successful write.
   */
  private async commitScheduleMutation(opts: {
    roomId: string;
    userId: string;
    expectedVersion: number;
    clientMutationId?: string;
    extraSet?: Record<string, unknown>;
    mutate: (
      room: TravelRoomDocument,
    ) => Promise<{ result?: any; filesToDelete?: string[] } | void> | {
      result?: any;
      filesToDelete?: string[];
    } | void;
  }) {
    const room = await this.getRoomForMember(opts.roomId, opts.userId);
    const currentVersion = room.scheduleVersion ?? 0;

    if (
      opts.clientMutationId &&
      room.lastScheduleMutationId === opts.clientMutationId
    ) {
      return {
        idempotent: true,
        scheduleVersion: currentVersion,
        result: undefined,
        schedule: {
          days: room.schedule.days.map((d) => ({
            day: d.day,
            items: d.items.map((i) => serializeScheduleItem(i)),
          })),
        },
      };
    }

    if (opts.expectedVersion !== currentVersion) {
      throw scheduleConflict(currentVersion, opts.expectedVersion);
    }

    const side = (await opts.mutate(room)) ?? {};
    const nextVersion = currentVersion + 1;
    room.scheduleVersion = nextVersion;
    room.progress = this.computeProgress(room);
    if (opts.clientMutationId) {
      room.lastScheduleMutationId = opts.clientMutationId;
    }

    const updated = await this.roomModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(opts.roomId),
        'members.userId': new Types.ObjectId(opts.userId),
        scheduleVersion: currentVersion,
      },
      {
        $set: {
          schedule: room.schedule,
          scheduleVersion: nextVersion,
          progress: room.progress,
          candidatePlaces: room.candidatePlaces,
          ...(opts.clientMutationId
            ? { lastScheduleMutationId: opts.clientMutationId }
            : {}),
          ...(opts.extraSet ?? {}),
        },
      },
      { new: true },
    );

    if (!updated) {
      const latest = await this.roomModel
        .findById(opts.roomId)
        .select('scheduleVersion');
      throw scheduleConflict(
        latest?.scheduleVersion ?? currentVersion,
        opts.expectedVersion,
      );
    }

    if (side.filesToDelete?.length) {
      await Promise.all(
        side.filesToDelete.map((url) => this.uploads.deleteByPublicUrl(url)),
      );
    }

    return {
      idempotent: false,
      scheduleVersion: nextVersion,
      result: side.result,
      room: updated,
    };
  }

  private assertDayOverlaps(room: TravelRoomDocument, day: number) {
    const dayPlan = room.schedule.days.find((d) => d.day === day);
    if (!dayPlan) return;
    assertNoOverlap(
      dayPlan.items.map((i) => ({
        id: i.id,
        startTime: i.startTime,
        endTime: i.endTime,
      })),
    );
  }

  async addScheduleItem(roomId: string, userId: string, dto: ScheduleItemDto) {
    assertTimeRange(dto.startTime, dto.endTime);

    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        const { day, date } = resolveItemDayAndDate({
          day: dto.day,
          date: dto.date,
          startDate: room.startDate,
          endDate: room.endDate,
        });

        const allIds = new Set(
          room.schedule.days.flatMap((d) => d.items.map((i) => i.id)),
        );
        const id = dto.id ?? `item-${Date.now()}`;
        if (allIds.has(id)) {
          throw new BadRequestException(`일정 id 중복: ${id}`);
        }

        let dayPlan = room.schedule.days.find((d) => d.day === day);
        if (!dayPlan) {
          dayPlan = { day, items: [] };
          room.schedule.days.push(dayPlan);
        }

        const item: ItineraryItem = {
          id,
          placeId: dto.placeId ? new Types.ObjectId(dto.placeId) : undefined,
          placeName: dto.placeName,
          startTime: dto.startTime,
          endTime: dto.endTime,
          tags: dto.tags ?? [],
          reason: dto.reason ?? '',
          priority: dto.priority ?? 'optional',
          day,
          date,
          lat: dto.lat,
          lng: dto.lng,
          locked: false,
          tickets: [],
        };
        dayPlan.items.push(item);
        this.assertDayOverlaps(room, day);
        if (dto.placeId) this.syncCandidateScheduledFlags(room);
        return { result: serializeScheduleItem(item) };
      },
    });

    if ((dto.priority ?? 'optional') === 'must') {
      const itemId = committed.result.id as string;
      await this.todosService.ensureAutoTodo(roomId, userId, {
        title: `예약·입장권 확인: ${dto.placeName}`,
        description:
          '필수 일정입니다. 확정 예약 시각과 입장권/증빙을 공유하세요.',
        dedupeKey: `scheduleChange:must-confirm:${itemId}`,
        kind: 'scheduleChange',
        cause: 'must_item_created',
        baseRevision: String(committed.scheduleVersion),
        links: [{ type: 'scheduleItem', targetId: itemId }],
      });
      await this.todosService.ensureAutoTodo(roomId, userId, {
        title: `입장권 업로드: ${dto.placeName}`,
        dedupeKey: `scheduleChange:missing-ticket:${itemId}`,
        kind: 'scheduleChange',
        cause: 'missing_ticket',
        baseRevision: String(committed.scheduleVersion),
        links: [{ type: 'scheduleItem', targetId: itemId }],
      });
    }

    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async reorderSchedule(
    roomId: string,
    userId: string,
    dto: ReorderScheduleDto,
  ) {
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        const dayPlan = room.schedule.days.find((d) => d.day === dto.day);
        if (!dayPlan) throw new NotFoundException('Day not found');

        const existingIds = dayPlan.items.map((i) => i.id);
        const incoming = dto.itemIds;
        if (incoming.length !== existingIds.length) {
          throw new BadRequestException(
            `reorder는 해당 day의 모든 item id를 포함해야 합니다. 기대 ${existingIds.length}개, 전달 ${incoming.length}개`,
          );
        }
        const existingSet = new Set(existingIds);
        const incomingSet = new Set(incoming);
        if (
          existingSet.size !== incomingSet.size ||
          [...existingSet].some((id) => !incomingSet.has(id))
        ) {
          throw new BadRequestException(
            'reorder itemIds는 기존 일정 id의 exact permutation이어야 합니다.',
          );
        }

        for (const item of dayPlan.items) {
          assertNotLocked(item);
        }

        const map = new Map(dayPlan.items.map((i) => [i.id, i]));
        dayPlan.items = incoming.map((id) => map.get(id)!) as ItineraryItem[];
        return {
          result: {
            day: dayPlan.day,
            items: dayPlan.items.map((i) => serializeScheduleItem(i)),
          },
        };
      },
    });

    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async updateScheduleItem(
    roomId: string,
    userId: string,
    itemId: string,
    dto: UpdateScheduleItemDto,
  ) {
    if (dto.startTime != null || dto.endTime != null) {
      // validated after merge inside mutate
    }

    let filesToDelete: string[] = [];
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        for (const day of room.schedule.days) {
          const item = day.items.find((i) => i.id === itemId);
          if (!item) continue;

          assertNotLocked(item, { unlock: dto.unlock });

          const nextStart = dto.startTime ?? item.startTime;
          const nextEnd = dto.endTime ?? item.endTime;
          assertTimeRange(nextStart, nextEnd);

          const moved =
            dto.day != null ||
            dto.date != null ||
            dto.startTime != null ||
            dto.endTime != null ||
            dto.placeId !== undefined;

          if (item.locked && moved && dto.unlock) {
            item.locked = false;
            item.lockedBy = undefined;
            item.lockedAt = undefined;
          }

          if (dto.placeName != null) item.placeName = dto.placeName;
          if (dto.startTime != null) item.startTime = dto.startTime;
          if (dto.endTime != null) item.endTime = dto.endTime;
          if (dto.reason != null) item.reason = dto.reason;
          if (dto.priority != null) item.priority = dto.priority;
          if (dto.lat != null) item.lat = dto.lat;
          if (dto.lng != null) item.lng = dto.lng;

          if (dto.placeId !== undefined) {
            const nextPlaceId =
              dto.placeId === null || dto.placeId === ''
                ? undefined
                : new Types.ObjectId(dto.placeId);
            const cleared = ticketsForPlaceChange(item, nextPlaceId);
            filesToDelete = cleared.filesToDelete;
            item.tickets = cleared.tickets;
            if (cleared.filesToDelete.length) {
              item.reservation = undefined;
            }
            item.placeId = nextPlaceId;
          }

          let targetDay = day.day;
          if (dto.day != null || dto.date != null) {
            const resolved = resolveItemDayAndDate({
              day: dto.day ?? item.day,
              date: dto.date ?? item.date,
              startDate: room.startDate,
              endDate: room.endDate,
            });
            targetDay = resolved.day;
            item.day = resolved.day;
            item.date = resolved.date;
          }

          if (targetDay !== day.day) {
            day.items = day.items.filter((i) => i.id !== itemId);
            let target = room.schedule.days.find((d) => d.day === targetDay);
            if (!target) {
              target = { day: targetDay, items: [] };
              room.schedule.days.push(target);
            }
            target.items.push(item);
            this.assertDayOverlaps(room, day.day);
            this.assertDayOverlaps(room, targetDay);
          } else {
            this.assertDayOverlaps(room, day.day);
          }

          this.syncCandidateScheduledFlags(room);
          return {
            result: serializeScheduleItem(item),
            filesToDelete,
          };
        }
        throw new NotFoundException('Schedule item not found');
      },
    });

    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async deleteScheduleItem(
    roomId: string,
    userId: string,
    itemId: string,
    expectedVersion: number,
    clientMutationId?: string,
    unlock?: boolean,
  ) {
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion,
      clientMutationId,
      mutate: (room) => {
        for (const day of room.schedule.days) {
          const removed = day.items.find((i) => i.id === itemId);
          if (!removed) continue;
          assertNotLocked(removed, { unlock });
          day.items = day.items.filter((i) => i.id !== itemId);
          this.syncCandidateScheduledFlags(room);
          return {
            result: { success: true },
            filesToDelete: (removed.tickets ?? []).map((t) => t.imageUrl),
          };
        }
        throw new NotFoundException('Schedule item not found');
      },
    });
    const linkImpact = await this.todosService.detachScheduleItem(
      roomId,
      itemId,
    );
    return {
      success: true,
      scheduleVersion: committed.scheduleVersion,
      todoLinkImpact: linkImpact,
    };
  }

  async setScheduleItemLock(
    roomId: string,
    userId: string,
    itemId: string,
    dto: LockScheduleItemDto,
  ) {
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        const item = this.findScheduleItem(room, itemId);
        item.locked = dto.locked;
        if (dto.locked) {
          item.lockedBy = new Types.ObjectId(userId);
          item.lockedAt = new Date();
        } else {
          item.lockedBy = undefined;
          item.lockedAt = undefined;
        }
        return { result: serializeScheduleItem(item) };
      },
    });
    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async upsertReservation(
    roomId: string,
    userId: string,
    itemId: string,
    dto: UpsertReservationDto,
  ) {
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        const item = this.findScheduleItem(room, itemId);
        const prev = item.reservation;
        const now = new Date();
        const status = dto.status ?? prev?.status ?? 'unconfirmed';
        const reservation: ConfirmedReservation = {
          id: prev?.id ?? `res-${Date.now()}`,
          status,
          date: dto.date ?? prev?.date,
          startTime: dto.startTime ?? prev?.startTime,
          endTime: dto.endTime ?? prev?.endTime,
          timeWindowStart: dto.timeWindowStart ?? prev?.timeWindowStart,
          timeWindowEnd: dto.timeWindowEnd ?? prev?.timeWindowEnd,
          timezone:
            dto.timezone ?? prev?.timezone ?? room.timezone ?? 'Asia/Seoul',
          placeId: dto.placeId
            ? new Types.ObjectId(dto.placeId)
            : prev?.placeId,
          externalId: dto.externalId ?? prev?.externalId,
          confirmationCode: dto.confirmationCode ?? prev?.confirmationCode,
          note: dto.note ?? prev?.note,
          documentTicketIds:
            dto.documentTicketIds ?? prev?.documentTicketIds ?? [],
          confirmedBy:
            status === 'confirmed'
              ? new Types.ObjectId(userId)
              : prev?.confirmedBy,
          confirmedAt: status === 'confirmed' ? now : prev?.confirmedAt,
          revision: (prev?.revision ?? 0) + 1,
        };
        item.reservation = reservation;
        return { result: toReservationDto(reservation) };
      },
    });

    const reservation = committed.result as {
      id: string;
      status: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      timeWindowStart?: string;
      timeWindowEnd?: string;
    };
    const complete =
      reservation.status === 'confirmed' &&
      !!reservation.date &&
      !!(reservation.startTime || reservation.timeWindowStart) &&
      !!(reservation.endTime || reservation.timeWindowEnd);

    if (complete) {
      await this.todosService.resolveAuto(roomId, userId, {
        dedupeKey: `ocrConfirm:reservation:${reservation.id}`,
      });
      await this.todosService.resolveAuto(roomId, userId, {
        dedupeKey: `scheduleChange:must-confirm:${itemId}`,
      });
    } else {
      await this.todosService.ensureAutoTodo(roomId, userId, {
        title: '예약 정보 확인 필요',
        description:
          '날짜·시간(또는 허용 시간창)이 확정되지 않았습니다. OCR/수동 확인 후 저장하세요.',
        dedupeKey: `ocrConfirm:reservation:${reservation.id}`,
        kind: 'ocrConfirm',
        cause: 'reservation_incomplete',
        baseRevision: String(committed.scheduleVersion),
        links: [
          { type: 'scheduleItem', targetId: itemId },
          { type: 'reservation', targetId: reservation.id, scheduleItemId: itemId },
        ],
      });
    }

    return {
      reservation: committed.result,
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async deleteReservation(
    roomId: string,
    userId: string,
    itemId: string,
    expectedVersion: number,
    clientMutationId?: string,
  ) {
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion,
      clientMutationId,
      mutate: (room) => {
        const item = this.findScheduleItem(room, itemId);
        if (!item.reservation) {
          throw new NotFoundException('Reservation not found');
        }
        item.reservation = undefined;
        return { result: { success: true } };
      },
    });
    return { success: true, scheduleVersion: committed.scheduleVersion };
  }

  async listScheduleTickets(roomId: string, userId: string, itemId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const item = this.findScheduleItem(room, itemId);
      return {
        tickets: (item.tickets ?? []).map((t) => this.toTicketDto(t, roomId)),
        scheduleVersion: room.scheduleVersion ?? 0,
      };
  }

  async uploadScheduleTicket(
    roomId: string,
    userId: string,
    itemId: string,
    file: Express.Multer.File,
    note: string | undefined,
    expectedVersion: number,
    clientMutationId?: string,
  ) {
    // Pre-check membership/version before writing file
    const room = await this.getRoomForMember(roomId, userId);
    const currentVersion = room.scheduleVersion ?? 0;
    if (
      clientMutationId &&
      room.lastScheduleMutationId === clientMutationId
    ) {
      const item = this.findScheduleItem(room, itemId);
      return {
        idempotent: true,
        scheduleVersion: currentVersion,
        tickets: (item.tickets ?? []).map((t) => this.toTicketDto(t, roomId)),
      };
    }
    if (expectedVersion !== currentVersion) {
      throw scheduleConflict(currentVersion, expectedVersion);
    }
    const itemPre = this.findScheduleItem(room, itemId);
    if ((itemPre.tickets ?? []).length >= TICKET_MAX_PER_ITEM) {
      throw new BadRequestException(
        `일정 항목당 입장권은 최대 ${TICKET_MAX_PER_ITEM}장까지 업로드할 수 있습니다`,
      );
    }

    const saved = await this.uploads.saveTicketImage(roomId, file);
    try {
      const committed = await this.commitScheduleMutation({
        roomId,
        userId,
        expectedVersion,
        clientMutationId,
        mutate: (r) => {
          const item = this.findScheduleItem(r, itemId);
          if (!item.tickets) item.tickets = [];
          if (item.tickets.length >= TICKET_MAX_PER_ITEM) {
            throw new BadRequestException(
              `일정 항목당 입장권은 최대 ${TICKET_MAX_PER_ITEM}장까지 업로드할 수 있습니다`,
            );
          }
          const ticket: ScheduleTicket = {
            id: saved.ticketId,
            imageUrl: saved.imageUrl,
            uploadedBy: new Types.ObjectId(userId),
            note: note?.trim() || undefined,
            originalName: file.originalname,
            mimeType: file.mimetype,
            createdAt: new Date(),
          };
          item.tickets.push(ticket);
          return { result: this.toTicketDto(ticket, roomId) };
        },
      });
      await this.todosService.resolveAuto(roomId, userId, {
        dedupeKey: `scheduleChange:missing-ticket:${itemId}`,
      });
      return {
        ...committed.result,
        scheduleVersion: committed.scheduleVersion,
      };
    } catch (err) {
      // conflict/fail after file write → remove orphan of this request
      await this.uploads.deleteByPublicUrl(saved.imageUrl);
      throw err;
    }
  }

  async deleteScheduleTicket(
    roomId: string,
    userId: string,
    itemId: string,
    ticketId: string,
    expectedVersion: number,
    clientMutationId?: string,
  ) {
    let placeName = '';
    let remaining = 0;
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion,
      clientMutationId,
      mutate: (room) => {
        const item = this.findScheduleItem(room, itemId);
        placeName = item.placeName;
        const tickets = item.tickets ?? [];
        const ticket = tickets.find((t) => t.id === ticketId);
        if (!ticket) throw new NotFoundException('Ticket not found');
        item.tickets = tickets.filter((t) => t.id !== ticketId);
        remaining = item.tickets.length;
        return {
          result: { success: true },
          filesToDelete: [ticket.imageUrl],
        };
      },
    });
    if (remaining === 0) {
      await this.todosService.ensureAutoTodo(roomId, userId, {
        title: `입장권 업로드: ${placeName || itemId}`,
        dedupeKey: `scheduleChange:missing-ticket:${itemId}`,
        kind: 'scheduleChange',
        cause: 'missing_ticket',
        baseRevision: String(committed.scheduleVersion),
        links: [{ type: 'scheduleItem', targetId: itemId }],
      });
    }
    return { success: true, scheduleVersion: committed.scheduleVersion };
  }

  private findScheduleItem(room: TravelRoomDocument, itemId: string) {
    for (const day of room.schedule.days) {
      const item = day.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    throw new NotFoundException('Schedule item not found');
  }

  private toTicketDto(ticket: ScheduleTicket, roomId: string) {
    const download = this.signedUrls.createDownloadUrl({
      publicPath: ticket.imageUrl,
      roomId,
    });
    return {
      id: ticket.id,
      imageUrl: ticket.imageUrl,
      download,
      uploadedBy: ticket.uploadedBy.toString(),
      note: ticket.note,
      originalName: ticket.originalName,
      mimeType: ticket.mimeType,
      createdAt: ticket.createdAt,
    };
  }

  async saveSchedule(roomId: string, userId: string, dto: BatchScheduleDto) {
    const filesToDelete: string[] = [];
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: (room) => {
        for (const d of dto.days) {
          for (const item of d.items) {
            assertTimeRange(item.startTime, item.endTime);
          }
        }

        const previousById = new Map(
          room.schedule.days
            .flatMap((d) => d.items)
            .map((item) => [item.id, item] as const),
        );

        // Locked items must remain unless unlock via same payload locked:false
        for (const [id, prev] of previousById) {
          if (!prev.locked) continue;
          const next = dto.days
            .flatMap((d) => d.items)
            .find((i) => i.id === id);
          if (!next) {
            throw new ForbiddenException({
              code: 'SCHEDULE_ITEM_LOCKED',
              message: `잠긴 일정 ${id}는 batch에서 삭제할 수 없습니다.`,
              itemId: id,
            });
          }
          const nextDay = next.day ?? dto.days.find((d) =>
            d.items.some((i) => i.id === id),
          )?.day;
          const timeChanged =
            next.startTime !== prev.startTime ||
            next.endTime !== prev.endTime ||
            nextDay !== prev.day;
          const placeChanged =
            (next.placeId ?? null) !== (prev.placeId?.toString() ?? null);
          if (
            (timeChanged || placeChanged) &&
            next.locked !== false
          ) {
            throw new ForbiddenException({
              code: 'SCHEDULE_ITEM_LOCKED',
              message: `잠긴 일정 ${id}는 이동·리사이즈·장소 교체할 수 없습니다.`,
              itemId: id,
            });
          }
        }

        const nextIds = new Set(
          dto.days.flatMap((d) =>
            d.items.map((item) => item.id).filter((id): id is string => !!id),
          ),
        );
        for (const [id, prev] of previousById) {
          if (!nextIds.has(id)) {
            filesToDelete.push(...(prev.tickets ?? []).map((t) => t.imageUrl));
          }
        }

        room.schedule.days = dto.days.map((d) => ({
          day: d.day,
          items: d.items.map((item) => {
            const resolved = resolveItemDayAndDate({
              day: item.day ?? d.day,
              date: item.date,
              startDate: room.startDate,
              endDate: room.endDate,
            });
            const id = item.id ?? `item-${Date.now()}-${Math.random()}`;
            const previous = previousById.get(id);
            const nextPlaceId = item.placeId
              ? new Types.ObjectId(item.placeId)
              : undefined;
            const ticketCarry = ticketsForPlaceChange(previous, nextPlaceId);
            filesToDelete.push(...ticketCarry.filesToDelete);

            const locked =
              item.locked === false
                ? false
                : item.locked === true
                  ? true
                  : (previous?.locked ?? false);

            return {
              id,
              placeId: nextPlaceId,
              placeName: item.placeName,
              startTime: item.startTime,
              endTime: item.endTime,
              tags: item.tags ?? [],
              reason: item.reason ?? '',
              priority: item.priority ?? 'optional',
              day: resolved.day,
              date: resolved.date,
              lat: item.lat,
              lng: item.lng,
              locked,
              lockedBy: locked ? previous?.lockedBy : undefined,
              lockedAt: locked ? previous?.lockedAt : undefined,
              tickets: ticketCarry.tickets,
              reservation: ticketCarry.filesToDelete.length
                ? undefined
                : previous?.reservation,
            } as ItineraryItem;
          }),
        }));

        for (const d of room.schedule.days) {
          this.assertDayOverlaps(room, d.day);
        }
        this.syncCandidateScheduledFlags(room);
        return {
          result: {
            days: room.schedule.days.map((d) => ({
              day: d.day,
              items: d.items.map((i) => serializeScheduleItem(i)),
            })),
          },
          filesToDelete,
        };
      },
    });

    const roomDoc =
      committed.room ?? (await this.getRoomForMember(roomId, userId));
    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
      planning: planningSnapshot(roomDoc),
    };
  }

  async updatePlanning(
    roomId: string,
    userId: string,
    dto: UpdatePlanningDto,
  ) {
    const room = await this.getRoomForOwner(roomId, userId);
    if (dto.timezone != null) room.timezone = dto.timezone;
    if (dto.lodging !== undefined) {
      room.lodging = fromAnchorDto(dto.lodging ?? undefined);
    }
    if (dto.returnPoint !== undefined) {
      room.returnPoint = fromAnchorDto(dto.returnPoint ?? undefined);
    }
    if (dto.transportMode != null) {
      room.transportMode = setVersionedValue(
        room.transportMode,
        dto.transportMode,
        userId,
        dto.confirm,
      );
    }
    if (dto.returnDeadline != null) {
      room.returnDeadline = setVersionedValue(
        room.returnDeadline,
        dto.returnDeadline,
        userId,
        dto.confirm,
      );
    }
    if (dto.travelBufferMinutes != null) {
      room.travelBufferMinutes = setVersionedValue(
        room.travelBufferMinutes,
        dto.travelBufferMinutes,
        userId,
        dto.confirm,
      );
    }
    if (dto.prepBufferMinutes != null) {
      room.prepBufferMinutes = setVersionedValue(
        room.prepBufferMinutes,
        dto.prepBufferMinutes,
        userId,
        dto.confirm,
      );
    }
    await room.save();
    return planningSnapshot(room);
  }

  /** Keep candidate.scheduled in sync with schedule placeIds. */
  private syncCandidateScheduledFlags(room: TravelRoomDocument) {
    const scheduledPlaceIds = new Set(
      room.schedule.days
        .flatMap((d) => d.items)
        .map((i) => i.placeId?.toString())
        .filter(Boolean),
    );
    for (const c of room.candidatePlaces) {
      c.scheduled = scheduledPlaceIds.has(c.placeId.toString());
    }
  }

  async getScheduleSummary(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const tagCounts: Record<string, number> = {};
    const dayPlans: Record<string, string> = {};

    for (const day of room.schedule.days) {
      const names = day.items.map((i) => i.placeName);
      dayPlans[`day${day.day}`] = names.join(' → ') || '일정 없음';
      for (const item of day.items) {
        for (const tag of item.tags) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
      }
    }

    return {
      title: room.title,
      description: room.destination?.name
        ? `${room.destination.name} 여행 최종 일정`
        : '여행 일정 요약',
      preferences: tagCounts,
      dayPlans,
    };
  }

  async getCompatibility(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const types = room.members.map((m) => m.travelTypeSnapshot);
    return calculateMatchResult(types);
  }

  async getMatchResult(roomId: string, userId: string) {
    return this.getCompatibility(roomId, userId);
  }

  async getAdjustmentPlan(roomId: string, userId: string) {
    await this.getRoomForMember(roomId, userId);
    return buildAdjustmentPlan();
  }

  async getCourses(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return buildCourses(room.destination?.name);
  }

  async setScheduleStyle(roomId: string, userId: string, style: 'jType' | 'pType') {
    const room = await this.getRoomForMember(roomId, userId);
    room.scheduleStyle = style;
    await room.save();
    return { scheduleStyle: room.scheduleStyle };
  }

  async selectCourse(roomId: string, userId: string, courseId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    room.selectedCourseId = courseId;
    await room.save();
    return { selectedCourseId: courseId };
  }

  async getAnalysisBaseline(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    return {
      scheduleVersion: room.scheduleVersion ?? 0,
      factsVersion: room.factsVersion ?? 0,
      timezone: room.timezone ?? 'Asia/Seoul',
      startDate: room.startDate ?? null,
      endDate: room.endDate ?? null,
      planning: planningSnapshot(room),
    };
  }

  async updateTripDates(
    roomId: string,
    userId: string,
    dto: UpdateTripDatesDto,
  ) {
    await this.getRoomForOwner(roomId, userId);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate는 startDate 이후여야 합니다');
    }

    const filesToDelete: string[] = [];
    const detached: string[] = [];

    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      extraSet: { startDate, endDate },
      mutate: (room) => {
        room.startDate = startDate;
        room.endDate = endDate;

        const actions = new Map(
          (dto.itemActions ?? []).map((a) => [a.itemId, a]),
        );
        const allItems = room.schedule.days.flatMap((d) =>
          d.items.map((item) => ({ day: d.day, item })),
        );

        for (const { item } of allItems) {
          const action = actions.get(item.id);
          if (!action || action.action === 'keep') {
            // re-validate day against new span; re-derive date from day
            const max = tripDayCount(startDate, endDate)!;
            if (item.day > max) {
              throw new BadRequestException({
                code: 'ITEM_OUT_OF_RANGE',
                message: `일정 ${item.id}의 day=${item.day}가 새 여행 기간(1~${max})을 벗어납니다. itemActions로 move/delete 하세요.`,
                itemId: item.id,
              });
            }
            if (item.locked && action?.unlock) {
              item.locked = false;
              item.lockedBy = undefined;
              item.lockedAt = undefined;
            }
            item.date = dayToDate(startDate, item.day);
            continue;
          }

          assertNotLocked(item, { unlock: action.unlock });
          if (action.unlock) {
            item.locked = false;
            item.lockedBy = undefined;
            item.lockedAt = undefined;
          }

          if (action.action === 'delete') {
            filesToDelete.push(
              ...(item.tickets ?? []).map((t) => t.imageUrl),
            );
            detached.push(item.id);
            for (const day of room.schedule.days) {
              day.items = day.items.filter((i) => i.id !== item.id);
            }
            continue;
          }

          // move
          const resolved = resolveItemDayAndDate({
            day: action.day,
            date: action.date,
            startDate,
            endDate,
          });
          // remove from old day
          for (const day of room.schedule.days) {
            day.items = day.items.filter((i) => i.id !== item.id);
          }
          item.day = resolved.day;
          item.date = resolved.date;
          let target = room.schedule.days.find((d) => d.day === resolved.day);
          if (!target) {
            target = { day: resolved.day, items: [] };
            room.schedule.days.push(target);
          }
          target.items.push(item);
        }

        // drop empty days, validate overlaps
        room.schedule.days = room.schedule.days.filter(
          (d) => d.items.length > 0,
        );
        for (const d of room.schedule.days) {
          this.assertDayOverlaps(room, d.day);
        }
        this.syncCandidateScheduledFlags(room);
        return {
          result: {
            startDate,
            endDate,
            days: room.schedule.days.map((d) => ({
              day: d.day,
              items: d.items.map((i) => serializeScheduleItem(i)),
            })),
          },
          filesToDelete,
        };
      },
    });

    const linkImpacts = [];
    for (const id of detached) {
      linkImpacts.push(await this.todosService.detachScheduleItem(roomId, id));
    }

    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
      todoLinkImpacts: linkImpacts,
    };
  }

  async applyScheduleProposal(
    roomId: string,
    userId: string,
    dto: ApplyScheduleProposalDto,
  ) {
    const roomPeek = await this.getRoomForMember(roomId, userId);
    if (
      dto.expectedFactsVersion != null &&
      dto.expectedFactsVersion !== (roomPeek.factsVersion ?? 0)
    ) {
      throw new ConflictException({
        code: 'FACTS_VERSION_CONFLICT',
        message: '분석 기준 데이터가 변경되었습니다. 다시 분석하세요.',
        currentFactsVersion: roomPeek.factsVersion ?? 0,
        expectedFactsVersion: dto.expectedFactsVersion,
      });
    }

    // Reuse batch save with lock/reservation checks
    return this.saveSchedule(roomId, userId, {
      days: dto.days,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
    });
  }

  async getMemberPreferences(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const memberIds = room.members.map((m) => m.userId);
    const users = await this.userModel.find({ _id: { $in: memberIds } });
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    const members = room.members.map((m) => {
      const uid = m.userId.toString();
      const user = byId.get(uid);
      const axes = user?.personalityAxes;
      const constraints = m.mobilityConstraints ?? {
        values: user?.mobilityConstraints ?? [],
        status: user?.mobilityConstraints?.length ? 'present' : 'missing',
        source: 'user',
        version: 1,
        updatedAt: null,
      };

      return {
        userId: uid,
        nickname: user?.nickname ?? null,
        travelType: m.travelTypeSnapshot
          ? {
              name: m.travelTypeSnapshot.name,
              tags: m.travelTypeSnapshot.tags,
              emoji: m.travelTypeSnapshot.emoji,
            }
          : null,
        // derived only — never raw quiz answers
        personalityAxes: axes
          ? {
              scheduleDensity: {
                value: axes.scheduleDensity,
                unit: 'score',
                range: [0, 100],
                resolution: 1,
                source: 'quiz',
                method: 'rule-based-4axis',
              },
              landmarkNecessity: {
                value: axes.landmarkNecessity,
                unit: 'score',
                range: [0, 100],
                resolution: 1,
                source: 'quiz',
                method: 'rule-based-4axis',
              },
              localInterest: {
                value: axes.localInterest,
                unit: 'score',
                range: [0, 100],
                resolution: 1,
                source: 'quiz',
                method: 'rule-based-4axis',
              },
              challenging: {
                value: axes.challenging,
                unit: 'score',
                range: [0, 100],
                resolution: 1,
                source: 'quiz',
                method: 'rule-based-4axis',
              },
            }
          : null,
        mobilityConstraints: {
          values: constraints.values ?? [],
          status: constraints.status ?? 'missing',
          source: constraints.source ?? 'user',
          version: constraints.version ?? 1,
          updatedAt: constraints.updatedAt ?? null,
          // missing/stale ≠ "no constraints"
        },
        preferenceUpdatedAt: m.preferenceUpdatedAt ?? null,
        interestTags: user?.interestTags ?? [],
      };
    });

    const candidateSignals = room.candidatePlaces.map((c) => ({
      placeId: c.placeId.toString(),
      signals: (c.memberSignals ?? []).map((s) => ({
        userId: s.userId.toString(),
        mustVisit: s.mustVisit ?? null,
        avoid: s.avoid ?? null,
        preferenceStrength:
          s.preferenceStrength === undefined ? null : s.preferenceStrength,
        version: s.version ?? 1,
        updatedAt: s.updatedAt ?? null,
      })),
    }));

    return {
      factsVersion: room.factsVersion ?? 0,
      scheduleVersion: room.scheduleVersion ?? 0,
      members,
      candidateSignals,
    };
  }

  async upsertCandidateSignal(
    roomId: string,
    userId: string,
    placeId: string,
    dto: UpsertCandidateSignalDto,
  ) {
    const room = await this.getRoomForMember(roomId, userId);
    const candidate = room.candidatePlaces.find(
      (c) => c.placeId.toString() === placeId,
    );
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (!candidate.memberSignals) candidate.memberSignals = [];

    let signal = candidate.memberSignals.find(
      (s) => s.userId.toString() === userId,
    );
    if (!signal) {
      signal = {
        userId: new Types.ObjectId(userId),
        version: 0,
        updatedAt: new Date(),
      };
      candidate.memberSignals.push(signal);
    }
    if (dto.mustVisit !== undefined) signal.mustVisit = dto.mustVisit;
    if (dto.avoid !== undefined) signal.avoid = dto.avoid;
    if (dto.preferenceStrength !== undefined) {
      signal.preferenceStrength = dto.preferenceStrength;
    }
    signal.version = (signal.version ?? 0) + 1;
    signal.updatedAt = new Date();
    room.factsVersion = (room.factsVersion ?? 0) + 1;
    await room.save();

    return {
      placeId,
      signal: {
        userId,
        mustVisit: signal.mustVisit ?? null,
        avoid: signal.avoid ?? null,
        preferenceStrength:
          signal.preferenceStrength === undefined
            ? null
            : signal.preferenceStrength,
        version: signal.version,
        updatedAt: signal.updatedAt,
      },
      factsVersion: room.factsVersion,
    };
  }

  async refreshMyConstraints(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const user = await this.userModel.findById(userId);
    const member = room.members.find((m) => m.userId.toString() === userId)!;
    const prev = member.mobilityConstraints;
    member.mobilityConstraints = {
      values: user?.mobilityConstraints ?? [],
      status: user?.mobilityConstraints?.length ? 'present' : 'missing',
      source: 'user',
      version: (prev?.version ?? 0) + 1,
      updatedAt: new Date(),
    };
    member.preferenceUpdatedAt = new Date();
    room.factsVersion = (room.factsVersion ?? 0) + 1;
    await room.save();
    return {
      mobilityConstraints: member.mobilityConstraints,
      factsVersion: room.factsVersion,
    };
  }

  private formatRoom(room: TravelRoomDocument) {
    const progress = this.computeProgress(room);
    return {
      id: room._id.toString(),
      title: room.title,
      destination: room.destination,
      startDate: room.startDate,
      endDate: room.endDate,
      status: room.status,
      createdBy: room.createdBy.toString(),
      members: room.members.map((m) => ({
        userId: m.userId.toString(),
        role: m.role,
        joinedAt: m.joinedAt,
        travelTypeSnapshot: m.travelTypeSnapshot,
        mobilityConstraints: m.mobilityConstraints
          ? {
              values: m.mobilityConstraints.values,
              status: m.mobilityConstraints.status,
              version: m.mobilityConstraints.version,
              updatedAt: m.mobilityConstraints.updatedAt ?? null,
            }
          : null,
      })),
      inviteCode: room.inviteCode,
      inviteLink: room.inviteLink,
      progress,
      scheduleStyle: room.scheduleStyle,
      selectedCourseId: room.selectedCourseId,
      candidateCount: room.candidatePlaces.length,
      scheduleItemCount: room.schedule.days.reduce(
        (acc, d) => acc + d.items.length,
        0,
      ),
      scheduleVersion: room.scheduleVersion ?? 0,
      factsVersion: room.factsVersion ?? 0,
      planning: planningSnapshot(room),
    };
  }
}

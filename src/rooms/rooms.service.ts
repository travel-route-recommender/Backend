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
} from '../schemas/travel-room.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { Place, PlaceDocument } from '../schemas/place.schema';
import {
  AddCandidateDto,
  BatchScheduleDto,
  CreateFromCompatibilityDto,
  CreateRoomDto,
  ReorderScheduleDto,
  ScheduleItemDto,
  UpdateDestinationDto,
  UpdateRoomDto,
  UpdateScheduleItemDto,
} from './dto/room.dto';
import {
  buildAdjustmentPlan,
  buildCourses,
  calculateMatchResult,
} from '../quiz/quiz.data';
import { TourService } from '../tour/tour.service';
import {
  assertTimeRange,
  assertValidDay,
  tripDayCount,
} from './schedule.validation';

const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private config: ConfigService,
    private tourService: TourService,
  ) {}

  private inviteLink(code: string) {
    const base = this.config.get('INVITE_LINK_BASE', 'tripmatch://invite');
    return `${base}/${code}`;
  }

  private async getRoomForMember(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');

    const isMember = room.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (!isMember) throw new ForbiddenException('Not a room member');

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
        },
      ],
      progress: { label: '시작 전', currentStep: 0, percent: 0 },
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
      })),
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
    const room = await this.getRoomForMember(roomId, userId);
    if (dto.title) room.title = dto.title;
    if (dto.startDate) room.startDate = new Date(dto.startDate);
    if (dto.endDate) room.endDate = new Date(dto.endDate);
    if (dto.status) room.status = dto.status;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  async updateDestination(roomId: string, userId: string, dto: UpdateDestinationDto) {
    const room = await this.getRoomForMember(roomId, userId);
    room.destination = dto;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  async regenerateInvite(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const owner = room.members.find((m) => m.role === 'owner');
    if (owner?.userId.toString() !== userId) {
      throw new ForbiddenException('Only owner can regenerate invite');
    }

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
    });
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
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
    return room.candidatePlaces.map((c) => ({
      placeId: c.placeId.toString(),
      addedBy: c.addedBy.toString(),
      addedAt: c.addedAt,
      note: c.note,
      scheduled: c.scheduled,
      place: places.find((p) => p._id.toString() === c.placeId.toString()),
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
      places.map((p) => [p._id.toString(), p]),
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

    return this.placeModel.find({ _id: { $in: commonIds } });
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
      });
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
      ...room.schedule,
      scheduleVersion: room.scheduleVersion ?? 0,
    };
  }

  async getScheduleMap(roomId: string, userId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    const items = room.schedule.days.flatMap((d) =>
      d.items.map((item) => ({ ...item, day: d.day })),
    );
    return { items, scheduleVersion: room.scheduleVersion ?? 0 };
  }

  async addScheduleItem(roomId: string, userId: string, dto: ScheduleItemDto) {
    const room = await this.getRoomForMember(roomId, userId);
    assertTimeRange(dto.startTime, dto.endTime);
    const day = dto.day ?? 1;
    assertValidDay(day, room.startDate, room.endDate);

    let dayPlan = room.schedule.days.find((d) => d.day === day);
    if (!dayPlan) {
      dayPlan = { day, items: [] };
      room.schedule.days.push(dayPlan);
    }

    const item: ItineraryItem = {
      id: dto.id ?? `item-${Date.now()}`,
      placeId: dto.placeId ? new Types.ObjectId(dto.placeId) : undefined,
      placeName: dto.placeName,
      startTime: dto.startTime,
      endTime: dto.endTime,
      tags: dto.tags ?? [],
      reason: dto.reason ?? '',
      priority: dto.priority ?? 'optional',
      day,
      lat: dto.lat,
      lng: dto.lng,
    };
    dayPlan.items.push(item);

    if (dto.placeId) {
      this.syncCandidateScheduledFlags(room);
    }

    room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
    room.progress = this.computeProgress(room);
    await room.save();
    return item;
  }

  async reorderSchedule(roomId: string, userId: string, dto: ReorderScheduleDto) {
    const room = await this.getRoomForMember(roomId, userId);
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

    const map = new Map(dayPlan.items.map((i) => [i.id, i]));
    dayPlan.items = incoming.map((id) => map.get(id)!) as ItineraryItem[];

    room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
    await room.save();
    return { ...dayPlan, scheduleVersion: room.scheduleVersion };
  }

  async updateScheduleItem(
    roomId: string,
    userId: string,
    itemId: string,
    dto: UpdateScheduleItemDto,
  ) {
    const room = await this.getRoomForMember(roomId, userId);
    for (const day of room.schedule.days) {
      const item = day.items.find((i) => i.id === itemId);
      if (item) {
        const nextStart = dto.startTime ?? item.startTime;
        const nextEnd = dto.endTime ?? item.endTime;
        assertTimeRange(nextStart, nextEnd);

        if (dto.day != null) {
          assertValidDay(dto.day, room.startDate, room.endDate);
        }

        if (dto.placeName != null) item.placeName = dto.placeName;
        if (dto.startTime != null) item.startTime = dto.startTime;
        if (dto.endTime != null) item.endTime = dto.endTime;
        if (dto.reason != null) item.reason = dto.reason;
        if (dto.priority != null) item.priority = dto.priority;

        if (dto.day != null && dto.day !== day.day) {
          day.items = day.items.filter((i) => i.id !== itemId);
          item.day = dto.day;
          let target = room.schedule.days.find((d) => d.day === dto.day);
          if (!target) {
            target = { day: dto.day, items: [] };
            room.schedule.days.push(target);
          }
          target.items.push(item);
        }

        room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
        await room.save();
        return item;
      }
    }
    throw new NotFoundException('Schedule item not found');
  }

  async deleteScheduleItem(roomId: string, userId: string, itemId: string) {
    const room = await this.getRoomForMember(roomId, userId);
    for (const day of room.schedule.days) {
      const before = day.items.length;
      day.items = day.items.filter((i) => i.id !== itemId);
      if (day.items.length < before) {
        this.syncCandidateScheduledFlags(room);
        room.scheduleVersion = (room.scheduleVersion ?? 0) + 1;
        await room.save();
        return { success: true };
      }
    }
    throw new NotFoundException('Schedule item not found');
  }

  async saveSchedule(roomId: string, userId: string, dto: BatchScheduleDto) {
    const room = await this.getRoomForMember(roomId, userId);
    const currentVersion = room.scheduleVersion ?? 0;

    if (
      dto.expectedVersion != null &&
      dto.expectedVersion !== currentVersion
    ) {
      throw new ConflictException({
        message:
          '일정이 다른 멤버에 의해 먼저 수정되었습니다. 최신 일정을 다시 불러온 뒤 저장하세요.',
        currentVersion,
        expectedVersion: dto.expectedVersion,
      });
    }

    for (const d of dto.days) {
      assertValidDay(d.day, room.startDate, room.endDate);
      for (const item of d.items) {
        assertTimeRange(item.startTime, item.endTime);
      }
    }

    room.schedule.days = dto.days.map((d) => ({
      day: d.day,
      items: d.items.map((item) => ({
        id: item.id ?? `item-${Date.now()}-${Math.random()}`,
        placeId: item.placeId ? new Types.ObjectId(item.placeId) : undefined,
        placeName: item.placeName,
        startTime: item.startTime,
        endTime: item.endTime,
        tags: item.tags ?? [],
        reason: item.reason ?? '',
        priority: item.priority ?? 'optional',
        day: d.day,
        lat: item.lat,
        lng: item.lng,
      })),
    }));
    this.syncCandidateScheduledFlags(room);
    room.scheduleVersion = currentVersion + 1;
    room.progress = this.computeProgress(room);
    await room.save();
    return {
      ...room.schedule,
      scheduleVersion: room.scheduleVersion,
    };
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
    };
  }
}

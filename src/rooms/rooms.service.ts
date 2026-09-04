import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomInt, randomUUID } from 'crypto';
import {
  TravelRoom,
  TravelRoomDocument,
  ItineraryItem,
  ScheduleTicket,
  ConfirmedReservation,
  MemberConstraintSnapshot,
  CandidateMemberSignal,
  CandidatePlace,
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
import { calculateMatchResult } from '../quiz/quiz.data';
import { TourService } from '../tour/tour.service';
import {
  assertNoOverlap,
  assertTimeRange,
  assertTimeZone,
  assertYmd,
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
  findProtectedProposalConflicts,
  planningSnapshot,
  placeIdChanged,
  scheduleConflict,
  serializeScheduleItem,
  setVersionedValue,
  ticketsForPlaceChange,
  toReservationDto,
} from './schedule.helpers';
import { RoomTodosService } from './room-todos.service';
import { SignedUrlService } from '../common/storage/signed-url.service';
import { assertRoomMember, assertRoomOwner, requireRoom } from './room-access';
import { RoomDocumentsService } from './room-documents.service';
import {
  buildCanonicalInviteLink,
  buildInviteLandingHtml,
} from './invite-link';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateInviteCode = () =>
  Array.from(
    { length: 8 },
    () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)],
  ).join('');
const MAX_ROOM_MEMBERS = 64;

type ScheduleMutationSideEffect<TResult> = {
  result?: TResult;
  filesToDelete?: string[];
};

type ScheduleMutationOptions<TResult> = {
  roomId: string;
  userId: string;
  expectedVersion: number;
  clientMutationId?: string;
  expectedFactsVersion?: number;
  extraSet?: Record<string, unknown>;
  mutate: (
    room: TravelRoomDocument,
  ) =>
    | Promise<ScheduleMutationSideEffect<TResult> | void>
    | ScheduleMutationSideEffect<TResult>
    | void;
};

function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
}

function candidateSignalTimestamp(signal: CandidateMemberSignal) {
  const timestamp = signal.updatedAt
    ? new Date(signal.updatedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function mergeCandidateSignals(candidates: CandidatePlace[]) {
  const latestByMember = new Map<string, CandidateMemberSignal>();
  for (const candidate of candidates) {
    for (const signal of candidate.memberSignals ?? []) {
      const key = signal.userId.toString();
      const current = latestByMember.get(key);
      const signalVersion = signal.version ?? 0;
      const currentVersion = current?.version ?? 0;
      if (
        !current ||
        signalVersion > currentVersion ||
        (signalVersion === currentVersion &&
          candidateSignalTimestamp(signal) > candidateSignalTimestamp(current))
      ) {
        latestByMember.set(key, signal);
      }
    }
  }
  return [...latestByMember.values()];
}

function cloneCandidateSignal(signal: CandidateMemberSignal) {
  return {
    userId: signal.userId,
    ...(signal.mustVisit === undefined ? {} : { mustVisit: signal.mustVisit }),
    ...(signal.avoid === undefined ? {} : { avoid: signal.avoid }),
    ...(signal.preferenceStrength === undefined
      ? {}
      : { preferenceStrength: signal.preferenceStrength }),
    version: signal.version ?? 1,
    updatedAt: signal.updatedAt ?? new Date(),
  };
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private config: ConfigService,
    private tourService: TourService,
    private uploads: LocalUploadService,
    private todosService: RoomTodosService,
    private signedUrls: SignedUrlService,
    private documentsService: RoomDocumentsService,
  ) {}

  private inviteLink(code: string) {
    return buildCanonicalInviteLink({
      code,
      configuredBase: this.config.get<string>('INVITE_LINK_BASE'),
      appBaseUrl: this.config.get<string>('APP_BASE_URL'),
    });
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
    const labels = [
      '시작 전',
      '여행지 설정',
      '일정 설정',
      '동행자 초대',
      '후보 수집',
      '일정 작성',
    ];
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
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const inviteCode = generateInviteCode();

    const room = await this.roomModel.create({
      title: dto.title?.trim() || '새 여행방',
      createdBy: new Types.ObjectId(userId),
      inviteCode,
      inviteLink: this.inviteLink(inviteCode),
      members: [
        {
          userId: new Types.ObjectId(userId),
          role: 'owner',
          joinedAt: new Date(),
          travelTypeSnapshot: user?.travelType,
          personalityAxesSnapshot: user.personalityAxes,
          interestTagsSnapshot: user.interestTags ?? [],
          mobilityConstraints: this.snapshotConstraints(user),
          preferenceUpdatedAt: user?.personalityAxes ? new Date() : undefined,
        },
      ],
      progress: { label: '시작 전', currentStep: 0, percent: 0 },
      factsVersion: 0,
    });

    return this.formatRoom(room);
  }

  async createFromCompatibility(
    userId: string,
    dto: CreateFromCompatibilityDto,
  ) {
    const memberIds = [
      userId,
      ...new Set(dto.memberUserIds.filter((id) => id !== userId)),
    ];
    if (memberIds.length > MAX_ROOM_MEMBERS) {
      throw new BadRequestException(
        `여행방 참여자는 최대 ${MAX_ROOM_MEMBERS}명까지 지정할 수 있습니다.`,
      );
    }
    const users = await this.userModel.find({ _id: { $in: memberIds } });
    if (users.length !== memberIds.length) {
      throw new BadRequestException({
        code: 'ROOM_MEMBER_NOT_FOUND',
        message:
          '선택한 동행자 중 현재 가입 정보를 확인할 수 없는 사용자가 있습니다.',
      });
    }
    const inviteCode = generateInviteCode();

    const room = await this.roomModel.create({
      title: dto.title?.trim() || '궁합 멤버 여행방',
      createdBy: new Types.ObjectId(userId),
      inviteCode,
      inviteLink: this.inviteLink(inviteCode),
      members: users.map((u) => ({
        userId: u._id,
        role: u._id.toString() === userId ? 'owner' : 'member',
        joinedAt: new Date(),
        travelTypeSnapshot: u.travelType,
        personalityAxesSnapshot: u.personalityAxes,
        interestTagsSnapshot: u.interestTags ?? [],
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
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('여행방 이름을 입력해 주세요.');
      room.title = title;
    }
    if (dto.startDate || dto.endDate) {
      const hasSchedule = room.schedule.days.some(
        (day) => day.items.length > 0,
      );
      if (hasSchedule) {
        throw new BadRequestException({
          code: 'USE_TRIP_DATES_ENDPOINT',
          message:
            '일정이 있는 여행의 날짜는 일정 이동·삭제 여부를 함께 확인해 변경해야 합니다.',
        });
      }
      const startDate = dto.startDate
        ? new Date(dto.startDate)
        : room.startDate;
      const endDate = dto.endDate ? new Date(dto.endDate) : room.endDate;
      if (startDate && endDate && endDate < startDate) {
        throw new BadRequestException(
          '여행 종료일은 시작일과 같거나 이후여야 합니다.',
        );
      }
      if (startDate) room.startDate = startDate;
      if (endDate) room.endDate = endDate;
      room.factsVersion = (room.factsVersion ?? 0) + 1;
    }
    if (dto.status) room.status = dto.status;
    room.progress = this.computeProgress(room);
    await room.save();
    return this.formatRoom(room);
  }

  async updateDestination(
    roomId: string,
    userId: string,
    dto: UpdateDestinationDto,
  ) {
    await this.getRoomForOwner(roomId, userId);
    const updated = await this.roomModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(roomId),
        members: {
          $elemMatch: {
            userId: new Types.ObjectId(userId),
            role: 'owner',
          },
        },
      },
      { $set: { destination: dto }, $inc: { factsVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ForbiddenException({
        code: 'OWNER_REQUIRED',
        message: '방장만 여행지를 변경할 수 있습니다.',
      });
    }
    return this.formatRoom(updated);
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
    return {
      inviteCode: room.inviteCode,
      inviteLink: this.inviteLink(room.inviteCode),
    };
  }

  async acceptInvite(code: string, userId: string) {
    const normalizedCode = normalizeInviteCode(code);
    const room = await this.roomModel.findOne({ inviteCode: normalizedCode });
    if (!room) {
      throw new NotFoundException({
        code: 'INVALID_INVITE_CODE',
        message: '유효하지 않은 초대 코드입니다.',
      });
    }

    const already = room.members.some((m) => m.userId.toString() === userId);
    if (already) return this.formatRoom(room);

    if (room.status !== 'ongoing') {
      throw new ConflictException({
        code: 'ROOM_NOT_ONGOING',
        message: '이미 종료된 여행방에는 참여할 수 없습니다.',
      });
    }
    if (room.members.length >= MAX_ROOM_MEMBERS) {
      throw new ConflictException({
        code: 'ROOM_FULL',
        message: '여행방 참여 인원이 가득 찼습니다.',
      });
    }

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (user.isGuest) {
      const anotherRoom = await this.roomModel.findOne({
        _id: { $ne: room._id },
        status: 'ongoing',
        'members.userId': user._id,
      });
      if (anotherRoom) {
        throw new ConflictException({
          code: 'GUEST_ROOM_LIMIT',
          message: '게스트는 진행 중인 여행방 하나에만 참여할 수 있습니다.',
          details: { roomId: anotherRoom._id.toString() },
        });
      }
    }

    const updated = await this.roomModel.findOneAndUpdate(
      {
        _id: room._id,
        inviteCode: normalizedCode,
        status: 'ongoing',
        'members.userId': { $ne: user._id },
        $expr: { $lt: [{ $size: '$members' }, MAX_ROOM_MEMBERS] },
      },
      {
        $push: {
          members: {
            userId: user._id,
            role: 'member',
            joinedAt: new Date(),
            travelTypeSnapshot: user.travelType,
            personalityAxesSnapshot: user.personalityAxes,
            interestTagsSnapshot: user.interestTags ?? [],
            mobilityConstraints: this.snapshotConstraints(user),
            preferenceUpdatedAt: user.personalityAxes ? new Date() : undefined,
          },
        },
        $inc: { factsVersion: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const latest = await this.roomModel.findById(room._id);
      if (latest?.members.some((member) => member.userId.equals(user._id))) {
        return this.formatRoom(latest);
      }
      throw new ConflictException({
        code: latest?.status === 'ongoing' ? 'ROOM_FULL' : 'ROOM_NOT_ONGOING',
        message: '여행방 참여 상태가 변경되었습니다. 다시 확인해 주세요.',
      });
    }
    return this.formatRoom(updated);
  }

  private snapshotConstraints(
    user: UserDocument | null | undefined,
  ): MemberConstraintSnapshot {
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
      status: user.onboardingCompleted || values.length ? 'present' : 'missing',
      source: 'user',
      version: 1,
      updatedAt: new Date(),
    };
  }

  /** 초대 링크 미리보기 (비인증, 읽기 전용) */
  async getInvitePreview(code: string) {
    const room = await this.roomModel.findOne({
      inviteCode: normalizeInviteCode(code),
    });
    if (!room) {
      throw new NotFoundException({
        code: 'INVALID_INVITE_CODE',
        message: '유효하지 않은 초대 코드입니다.',
      });
    }

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

  async getInviteLandingPage(code: string) {
    const preview = await this.getInvitePreview(code);
    return buildInviteLandingHtml(preview.inviteCode);
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

    const placeMap = new Map(
      places.map((place) => [place._id.toString(), fromMongoPlace(place)]),
    );
    return {
      room: this.formatRoom(room),
      candidates: room.candidatePlaces.map((c) => ({
        placeId: c.placeId.toString(),
        addedBy: c.addedBy.toString(),
        addedAt: c.addedAt,
        note: c.note,
        scheduled: c.scheduled,
        place: placeMap.get(c.placeId.toString()),
      })),
      schedulePreview: {
        days: room.schedule.days.map((day) => ({
          day: day.day,
          items: day.items.map((item) => serializeScheduleItem(item)),
        })),
        scheduleVersion: room.scheduleVersion ?? 0,
        planning: planningSnapshot(room),
      },
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
    await this.getRoomForMember(roomId, userId);

    // placeId 직접 지정 또는 TourAPI contentId로 upsert 후 placeId 확보.
    let placeId = dto.placeId;
    if (!placeId) {
      if (!dto.tourContentId) {
        throw new BadRequestException('후보에 담을 장소 정보가 필요합니다.');
      }
      placeId = await this.tourService.resolvePlaceId(
        dto.tourContentId,
        dto.contentTypeId,
      );
    }

    const place = await this.placeModel.findById(placeId);
    if (!place) throw new NotFoundException('장소를 찾을 수 없습니다.');

    const placeObjectId = new Types.ObjectId(placeId);
    const userObjectId = new Types.ObjectId(userId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await this.getRoomForMember(roomId, userId);
      const alreadyAdded = room.candidatePlaces.some(
        (candidate) =>
          candidate.placeId.equals(placeObjectId) &&
          candidate.addedBy.equals(userObjectId),
      );
      if (alreadyAdded) return this.listCandidates(roomId, userId);

      const duplicateCandidates = room.candidatePlaces.filter((candidate) =>
        candidate.placeId.equals(placeObjectId),
      );
      const inheritedSignals = mergeCandidateSignals(duplicateCandidates);
      const nextCandidates = [
        ...room.candidatePlaces,
        {
          placeId: placeObjectId,
          addedBy: userObjectId,
          addedAt: new Date(),
          note: dto.note,
          scheduled: false,
          memberSignals: inheritedSignals.map(cloneCandidateSignal),
        },
      ];
      const updated = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          'members.userId': userObjectId,
          factsVersion: room.factsVersion ?? 0,
          scheduleVersion: room.scheduleVersion ?? 0,
          candidatePlaces: {
            $not: {
              $elemMatch: { placeId: placeObjectId, addedBy: userObjectId },
            },
          },
        },
        {
          $set: { candidatePlaces: nextCandidates },
          $inc: { factsVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (updated) return this.listCandidates(roomId, userId);
    }
    throw new ConflictException({
      code: 'CANDIDATE_ADD_CONFLICT',
      message:
        '후보 장소가 동시에 변경되었습니다. 목록을 새로 불러온 뒤 다시 시도해 주세요.',
    });
  }

  async removeCandidate(roomId: string, userId: string, placeId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const placeObjectId = new Types.ObjectId(placeId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await this.getRoomForMember(roomId, userId);
      const duplicateCandidates = room.candidatePlaces.filter((candidate) =>
        candidate.placeId.equals(placeObjectId),
      );
      const hasOwnCandidate = duplicateCandidates.some((candidate) =>
        candidate.addedBy.equals(userObjectId),
      );
      if (!hasOwnCandidate) return { success: true, removed: false };

      const mergedSignals = mergeCandidateSignals(duplicateCandidates);
      const nextCandidates = room.candidatePlaces.filter(
        (candidate) =>
          !(
            candidate.placeId.equals(placeObjectId) &&
            candidate.addedBy.equals(userObjectId)
          ),
      );
      for (const candidate of nextCandidates) {
        if (!candidate.placeId.equals(placeObjectId)) continue;
        candidate.memberSignals = mergedSignals.map(cloneCandidateSignal);
      }

      const factsVersion = room.factsVersion ?? 0;
      const scheduleVersion = room.scheduleVersion ?? 0;
      const updated = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          'members.userId': userObjectId,
          factsVersion,
          scheduleVersion,
          candidatePlaces: {
            $elemMatch: {
              placeId: placeObjectId,
              addedBy: userObjectId,
            },
          },
        },
        {
          $set: { candidatePlaces: nextCandidates },
          $inc: { factsVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (updated) return { success: true, removed: true };
    }
    throw new ConflictException({
      code: 'CANDIDATE_REMOVE_CONFLICT',
      message:
        '후보 장소가 동시에 변경되었습니다. 목록을 새로 불러온 뒤 다시 시도해 주세요.',
    });
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
  private async commitScheduleMutation<TResult>(
    opts: ScheduleMutationOptions<TResult>,
  ) {
    if (!Number.isInteger(opts.expectedVersion) || opts.expectedVersion < 0) {
      throw new BadRequestException(
        'expectedVersion은 0 이상의 정수여야 합니다.',
      );
    }
    if (
      opts.expectedFactsVersion !== undefined &&
      (!Number.isInteger(opts.expectedFactsVersion) ||
        opts.expectedFactsVersion < 0)
    ) {
      throw new BadRequestException(
        'expectedFactsVersion은 0 이상의 정수여야 합니다.',
      );
    }
    const room = await this.getRoomForMember(opts.roomId, opts.userId);
    const currentVersion = room.scheduleVersion ?? 0;
    const currentFactsVersion = room.factsVersion ?? 0;

    if (
      opts.clientMutationId &&
      room.lastScheduleMutationId === opts.clientMutationId &&
      currentVersion === opts.expectedVersion + 1
    ) {
      return {
        idempotent: true,
        scheduleVersion: currentVersion,
        result: undefined,
        room,
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
    if (
      opts.expectedFactsVersion !== undefined &&
      opts.expectedFactsVersion !== currentFactsVersion
    ) {
      throw new ConflictException({
        code: 'FACTS_VERSION_CONFLICT',
        message: '분석 기준 데이터가 변경되었습니다. 다시 분석하세요.',
        currentFactsVersion,
        expectedFactsVersion: opts.expectedFactsVersion,
      });
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
        factsVersion: currentFactsVersion,
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
      { returnDocument: 'after' },
    );

    if (!updated) {
      const latest = await this.roomModel.findById(opts.roomId);
      if (
        opts.clientMutationId &&
        latest?.lastScheduleMutationId === opts.clientMutationId &&
        (latest.scheduleVersion ?? 0) === opts.expectedVersion + 1
      ) {
        return {
          idempotent: true,
          scheduleVersion: latest.scheduleVersion ?? 0,
          result: undefined,
          room: latest,
          schedule: {
            days: latest.schedule.days.map((day) => ({
              day: day.day,
              items: day.items.map((item) => serializeScheduleItem(item)),
            })),
          },
        };
      }
      if ((latest?.factsVersion ?? 0) !== currentFactsVersion) {
        throw new ConflictException({
          code: 'FACTS_VERSION_CONFLICT',
          message:
            '일정에 연결되는 여행 정보가 변경되었습니다. 최신 정보를 불러온 뒤 다시 저장하세요.',
          currentFactsVersion: latest?.factsVersion ?? 0,
          expectedFactsVersion: currentFactsVersion,
        });
      }
      throw scheduleConflict(
        latest?.scheduleVersion ?? currentVersion,
        opts.expectedVersion,
      );
    }

    const filesToDelete = side.filesToDelete;
    if (filesToDelete?.length) {
      await this.runPostCommit('교체된 일정 파일 정리', () =>
        Promise.all(
          filesToDelete.map((url) => this.uploads.deleteByPublicUrl(url)),
        ),
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

  private async assertPlacesExist(placeIds: Array<string | undefined | null>) {
    const ids = [...new Set(placeIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    const existing = await this.placeModel
      .find({ _id: { $in: ids } })
      .select('_id')
      .lean();
    const found = new Set(existing.map((place) => String(place._id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new NotFoundException({
        code: 'PLACE_NOT_FOUND',
        message: '일정에 포함된 장소를 찾을 수 없습니다.',
        placeIds: missing,
      });
    }
  }

  private async runPostCommit<TResult>(
    operation: string,
    task: () => Promise<TResult>,
  ): Promise<TResult | undefined> {
    try {
      return await task();
    } catch (error) {
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.logger.error(`후속 작업 실패 (${operation})`, detail);
    }
  }

  async addScheduleItem(roomId: string, userId: string, dto: ScheduleItemDto) {
    assertTimeRange(dto.startTime, dto.endTime);

    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: async (room) => {
        await this.assertPlacesExist([dto.placeId]);
        const { day, date } = resolveItemDayAndDate({
          day: dto.day,
          date: dto.date,
          startDate: room.startDate,
          endDate: room.endDate,
        });

        const allIds = new Set(
          room.schedule.days.flatMap((d) => d.items.map((i) => i.id)),
        );
        const id = dto.id ?? `item-${randomUUID()}`;
        if (allIds.has(id)) {
          throw new BadRequestException(
            `같은 일정이 두 번 포함되어 있습니다: ${id}`,
          );
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

    if ((dto.priority ?? 'optional') === 'must' && committed.result) {
      const itemId = committed.result.id;
      await this.runPostCommit('필수 일정 확인 TODO 생성', async () => {
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
      });
    }

    return {
      ...(committed.result ?? {}),
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
        if (!dayPlan)
          throw new NotFoundException('DAY 일정을 찾을 수 없습니다.');

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
        dayPlan.items = incoming.map((id) => map.get(id)!);
        return {
          result: {
            day: dayPlan.day,
            items: dayPlan.items.map((i) => serializeScheduleItem(i)),
          },
        };
      },
    });

    return {
      ...(committed.result ?? {
        day: dto.day,
        items:
          (
            committed.room ?? (await this.getRoomForMember(roomId, userId))
          ).schedule.days
            .find((day) => day.day === dto.day)
            ?.items.map((item) => serializeScheduleItem(item)) ?? [],
      }),
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
    let clearedReservationId: string | undefined;
    let clearedTicketIds: string[] = [];
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: async (room) => {
        await this.assertPlacesExist([dto.placeId]);
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
            const changed = placeIdChanged(item.placeId, nextPlaceId);
            const cleared = ticketsForPlaceChange(item, nextPlaceId);
            filesToDelete = cleared.filesToDelete;
            if (changed) {
              clearedReservationId = item.reservation?.id;
              clearedTicketIds = (item.tickets ?? []).map(
                (ticket) => ticket.id,
              );
            }
            item.tickets = cleared.tickets;
            if (changed) item.reservation = undefined;
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
        throw new NotFoundException('일정 항목을 찾을 수 없습니다.');
      },
    });

    for (const ticketId of clearedTicketIds) {
      await this.runPostCommit('교체된 티켓 TODO 연결 해제', () =>
        this.todosService.detachLinkedTarget(roomId, 'ticket', ticketId),
      );
    }
    if (clearedReservationId) {
      const reservationId = clearedReservationId;
      await this.runPostCommit('교체된 예약 TODO 연결 해제', () =>
        this.todosService.detachLinkedTarget(
          roomId,
          'reservation',
          reservationId,
        ),
      );
    }

    return {
      ...(committed.result ??
        serializeScheduleItem(
          this.findScheduleItem(
            committed.room ?? (await this.getRoomForMember(roomId, userId)),
            itemId,
          ),
        )),
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
        throw new NotFoundException('일정 항목을 찾을 수 없습니다.');
      },
    });
    const linkImpact = await this.runPostCommit(
      '삭제된 일정 TODO 연결 해제',
      () => this.todosService.detachScheduleItem(roomId, itemId),
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
      ...(committed.result ??
        serializeScheduleItem(
          this.findScheduleItem(
            committed.room ?? (await this.getRoomForMember(roomId, userId)),
            itemId,
          ),
        )),
      scheduleVersion: committed.scheduleVersion,
    };
  }

  async upsertReservation(
    roomId: string,
    userId: string,
    itemId: string,
    dto: UpsertReservationDto,
  ) {
    if (dto.date) assertYmd(dto.date, 'date');
    if (dto.timezone) assertTimeZone(dto.timezone);
    const exactTouched =
      dto.startTime !== undefined || dto.endTime !== undefined;
    const windowTouched =
      dto.timeWindowStart !== undefined || dto.timeWindowEnd !== undefined;
    if (exactTouched && windowTouched) {
      throw new BadRequestException({
        code: 'RESERVATION_TIME_MODE_CONFLICT',
        message: '정확한 예약 시간과 허용 시간 범위 중 하나만 입력해 주세요.',
      });
    }
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      mutate: async (room) => {
        await this.assertPlacesExist([dto.placeId]);
        const item = this.findScheduleItem(room, itemId);
        if (dto.documentTicketIds) {
          const ticketIds = new Set(
            (item.tickets ?? []).map((ticket) => ticket.id),
          );
          const uniqueIds = [...new Set(dto.documentTicketIds)];
          if (uniqueIds.length !== dto.documentTicketIds.length) {
            throw new BadRequestException({
              code: 'DUPLICATE_RESERVATION_DOCUMENT',
              message: '예약에 같은 문서나 티켓을 중복 연결할 수 없습니다.',
            });
          }
          for (const documentId of uniqueIds) {
            if (ticketIds.has(documentId)) continue;
            if (
              !(await this.documentsService.assertDocumentInRoom(
                roomId,
                documentId,
              ))
            ) {
              throw new BadRequestException({
                code: 'RESERVATION_DOCUMENT_NOT_FOUND',
                message:
                  '예약에 연결할 문서나 티켓을 이 여행방에서 찾을 수 없습니다.',
                targetId: documentId,
              });
            }
          }
        }
        const prev = item.reservation;
        const now = new Date();
        const status = dto.status ?? prev?.status ?? 'unconfirmed';
        const startTime = exactTouched
          ? (dto.startTime ?? prev?.startTime)
          : prev?.startTime;
        const endTime = exactTouched
          ? (dto.endTime ?? prev?.endTime)
          : prev?.endTime;
        const timeWindowStart = windowTouched
          ? (dto.timeWindowStart ?? prev?.timeWindowStart)
          : prev?.timeWindowStart;
        const timeWindowEnd = windowTouched
          ? (dto.timeWindowEnd ?? prev?.timeWindowEnd)
          : prev?.timeWindowEnd;
        if ((startTime == null) !== (endTime == null)) {
          throw new BadRequestException({
            code: 'RESERVATION_TIME_INCOMPLETE',
            message: '예약 시작 시간과 종료 시간을 함께 입력해 주세요.',
          });
        }
        if ((timeWindowStart == null) !== (timeWindowEnd == null)) {
          throw new BadRequestException({
            code: 'RESERVATION_WINDOW_INCOMPLETE',
            message: '예약 가능 시간 범위의 시작과 종료를 함께 입력해 주세요.',
          });
        }
        if (startTime && endTime) assertTimeRange(startTime, endTime);
        if (timeWindowStart && timeWindowEnd) {
          assertTimeRange(timeWindowStart, timeWindowEnd);
        }
        const date = dto.date ?? prev?.date;
        if (date) assertYmd(date, 'date');
        if (
          status === 'confirmed' &&
          (!date ||
            !((startTime && endTime) || (timeWindowStart && timeWindowEnd)))
        ) {
          throw new BadRequestException({
            code: 'CONFIRMED_RESERVATION_INCOMPLETE',
            message:
              '예약 확정에는 날짜와 정확한 시간 또는 허용 시간 범위가 필요합니다.',
          });
        }
        const reservation: ConfirmedReservation = {
          id: prev?.id ?? `res-${randomUUID()}`,
          status,
          date,
          startTime: windowTouched ? undefined : startTime,
          endTime: windowTouched ? undefined : endTime,
          timeWindowStart: exactTouched ? undefined : timeWindowStart,
          timeWindowEnd: exactTouched ? undefined : timeWindowEnd,
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
            status === 'confirmed' ? new Types.ObjectId(userId) : undefined,
          confirmedAt: status === 'confirmed' ? now : undefined,
          revision: (prev?.revision ?? 0) + 1,
        };
        item.reservation = reservation;
        return { result: toReservationDto(reservation) };
      },
    });

    const roomAfter =
      committed.room ?? (await this.getRoomForMember(roomId, userId));
    const reservation =
      committed.result ??
      toReservationDto(this.findScheduleItem(roomAfter, itemId).reservation);
    if (!reservation) {
      throw new NotFoundException('예약 정보를 찾을 수 없습니다.');
    }
    const complete =
      reservation.status === 'confirmed' &&
      !!reservation.date &&
      !!(reservation.startTime || reservation.timeWindowStart) &&
      !!(reservation.endTime || reservation.timeWindowEnd);

    if (complete) {
      await this.runPostCommit('예약 확인 TODO 완료', async () => {
        await this.todosService.resolveAutoSystem(roomId, userId, {
          dedupeKey: `ocrConfirm:reservation:${reservation.id}`,
          expectedScheduleVersion: committed.scheduleVersion,
        });
        await this.todosService.resolveAutoSystem(roomId, userId, {
          dedupeKey: `scheduleChange:must-confirm:${itemId}`,
          expectedScheduleVersion: committed.scheduleVersion,
        });
      });
    } else {
      await this.runPostCommit('예약 확인 TODO 생성', () =>
        this.todosService.ensureAutoTodo(roomId, userId, {
          title: '예약 정보 확인 필요',
          description:
            '날짜·시간(또는 허용 시간 범위)이 확정되지 않았습니다. 내용을 확인한 뒤 저장해 주세요.',
          dedupeKey: `ocrConfirm:reservation:${reservation.id}`,
          kind: 'ocrConfirm',
          cause: 'reservation_incomplete',
          baseRevision: String(committed.scheduleVersion),
          links: [
            { type: 'scheduleItem', targetId: itemId },
            {
              type: 'reservation',
              targetId: reservation.id,
              scheduleItemId: itemId,
            },
          ],
        }),
      );
    }

    return {
      reservation,
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
    let reservationId = '';
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion,
      clientMutationId,
      mutate: (room) => {
        const item = this.findScheduleItem(room, itemId);
        if (!item.reservation) {
          throw new NotFoundException('예약 정보를 찾을 수 없습니다.');
        }
        reservationId = item.reservation.id;
        item.reservation = undefined;
        return { result: { success: true } };
      },
    });
    if (reservationId) {
      await this.runPostCommit('삭제된 예약 TODO 연결 해제', () =>
        this.todosService.detachLinkedTarget(
          roomId,
          'reservation',
          reservationId,
        ),
      );
    }
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
      room.lastScheduleMutationId === clientMutationId &&
      currentVersion === expectedVersion + 1
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
      if (committed.idempotent) {
        await this.runPostCommit('중복 입장권 업로드 파일 정리', () =>
          this.uploads.deleteByPublicUrl(saved.imageUrl),
        );
        const roomAfter =
          committed.room ?? (await this.getRoomForMember(roomId, userId));
        const currentItem = this.findScheduleItem(roomAfter, itemId);
        return {
          idempotent: true,
          scheduleVersion: committed.scheduleVersion,
          tickets: (currentItem.tickets ?? []).map((ticket) =>
            this.toTicketDto(ticket, roomId),
          ),
        };
      }
      await this.runPostCommit('입장권 TODO 완료', () =>
        this.todosService.resolveAutoSystem(roomId, userId, {
          dedupeKey: `scheduleChange:missing-ticket:${itemId}`,
          expectedScheduleVersion: committed.scheduleVersion,
        }),
      );
      return {
        ...committed.result,
        scheduleVersion: committed.scheduleVersion,
      };
    } catch (err) {
      // conflict/fail after file write → remove orphan of this request
      await this.runPostCommit('실패한 입장권 업로드 파일 정리', () =>
        this.uploads.deleteByPublicUrl(saved.imageUrl),
      );
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
        if (!ticket) throw new NotFoundException('티켓을 찾을 수 없습니다.');
        item.tickets = tickets.filter((t) => t.id !== ticketId);
        if (item.reservation?.documentTicketIds.includes(ticketId)) {
          item.reservation.documentTicketIds =
            item.reservation.documentTicketIds.filter((id) => id !== ticketId);
          item.reservation.revision = (item.reservation.revision ?? 0) + 1;
        }
        remaining = item.tickets.length;
        return {
          result: { success: true },
          filesToDelete: [ticket.imageUrl],
        };
      },
    });
    if (committed.idempotent) {
      const roomAfter =
        committed.room ?? (await this.getRoomForMember(roomId, userId));
      const item = this.findScheduleItem(roomAfter, itemId);
      placeName = item.placeName;
      remaining = (item.tickets ?? []).length;
    }
    await this.runPostCommit('삭제된 티켓 TODO 연결 해제', () =>
      this.todosService.detachLinkedTarget(roomId, 'ticket', ticketId),
    );
    if (remaining === 0) {
      await this.runPostCommit('입장권 확인 TODO 생성', () =>
        this.todosService.ensureAutoTodo(roomId, userId, {
          title: `입장권 업로드: ${placeName || itemId}`,
          dedupeKey: `scheduleChange:missing-ticket:${itemId}`,
          kind: 'scheduleChange',
          cause: 'missing_ticket',
          baseRevision: String(committed.scheduleVersion),
          links: [{ type: 'scheduleItem', targetId: itemId }],
        }),
      );
    }
    return { success: true, scheduleVersion: committed.scheduleVersion };
  }

  private findScheduleItem(room: TravelRoomDocument, itemId: string) {
    for (const day of room.schedule.days) {
      const item = day.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    throw new NotFoundException('일정 항목을 찾을 수 없습니다.');
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

  async saveSchedule(
    roomId: string,
    userId: string,
    dto: BatchScheduleDto,
    expectedFactsVersion?: number,
  ) {
    const filesToDelete: string[] = [];
    const detachedScheduleIds: string[] = [];
    const detachedTicketIds: string[] = [];
    const detachedReservationIds: string[] = [];
    const committed = await this.commitScheduleMutation({
      roomId,
      userId,
      expectedVersion: dto.expectedVersion,
      clientMutationId: dto.clientMutationId,
      expectedFactsVersion,
      mutate: async (room) => {
        await this.assertPlacesExist(
          dto.days.flatMap((day) => day.items.map((item) => item.placeId)),
        );
        const dayNumbers = dto.days.map((day) => day.day);
        if (new Set(dayNumbers).size !== dayNumbers.length) {
          throw new BadRequestException({
            code: 'DUPLICATE_SCHEDULE_DAY',
            message: '같은 DAY를 일정 요청에 두 번 포함할 수 없습니다.',
          });
        }
        const explicitIds = dto.days.flatMap((day) =>
          day.items.flatMap((item) => (item.id ? [item.id] : [])),
        );
        if (new Set(explicitIds).size !== explicitIds.length) {
          throw new BadRequestException({
            code: 'DUPLICATE_SCHEDULE_ITEM_ID',
            message: '일정 항목 ID가 중복되었습니다.',
          });
        }
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
          const nextDay =
            next.day ??
            dto.days.find((d) => d.items.some((i) => i.id === id))?.day;
          const timeChanged =
            next.startTime !== prev.startTime ||
            next.endTime !== prev.endTime ||
            nextDay !== prev.day;
          const placeChanged =
            (next.placeId ?? null) !== (prev.placeId?.toString() ?? null);
          if ((timeChanged || placeChanged) && next.locked !== false) {
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
            detachedScheduleIds.push(id);
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
            if (resolved.day !== d.day) {
              throw new BadRequestException({
                code: 'SCHEDULE_DAY_MISMATCH',
                message: '일정 항목의 day/date가 바깥 DAY와 일치하지 않습니다.',
                outerDay: d.day,
                itemDay: resolved.day,
                itemId: item.id ?? null,
              });
            }
            const id = item.id ?? `item-${randomUUID()}`;
            const previous = previousById.get(id);
            const nextPlaceId = item.placeId
              ? new Types.ObjectId(item.placeId)
              : undefined;
            const ticketCarry = ticketsForPlaceChange(previous, nextPlaceId);
            const changed = placeIdChanged(previous?.placeId, nextPlaceId);
            if (changed && previous) {
              detachedTicketIds.push(
                ...(previous.tickets ?? []).map((ticket) => ticket.id),
              );
              if (previous.reservation?.id) {
                detachedReservationIds.push(previous.reservation.id);
              }
            }
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
              tags: item.tags ?? previous?.tags ?? [],
              reason: item.reason ?? previous?.reason ?? '',
              priority: item.priority ?? previous?.priority ?? 'optional',
              day: resolved.day,
              date: resolved.date,
              lat: item.lat ?? previous?.lat,
              lng: item.lng ?? previous?.lng,
              locked,
              lockedBy: locked
                ? (previous?.lockedBy ?? new Types.ObjectId(userId))
                : undefined,
              lockedAt: locked ? (previous?.lockedAt ?? new Date()) : undefined,
              tickets: ticketCarry.tickets,
              reservation: changed ? undefined : previous?.reservation,
            };
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

    for (const itemId of detachedScheduleIds) {
      await this.runPostCommit('삭제된 일정 TODO 연결 해제', () =>
        this.todosService.detachScheduleItem(roomId, itemId),
      );
    }
    for (const ticketId of detachedTicketIds) {
      await this.runPostCommit('교체된 티켓 TODO 연결 해제', () =>
        this.todosService.detachLinkedTarget(roomId, 'ticket', ticketId),
      );
    }
    for (const reservationId of detachedReservationIds) {
      await this.runPostCommit('교체된 예약 TODO 연결 해제', () =>
        this.todosService.detachLinkedTarget(
          roomId,
          'reservation',
          reservationId,
        ),
      );
    }

    const roomDoc =
      committed.room ?? (await this.getRoomForMember(roomId, userId));
    if (committed.idempotent) {
      return {
        idempotent: true,
        days: roomDoc.schedule.days.map((day) => ({
          day: day.day,
          items: day.items.map((item) => serializeScheduleItem(item)),
        })),
        scheduleVersion: committed.scheduleVersion,
        planning: planningSnapshot(roomDoc),
      };
    }
    return {
      ...committed.result,
      scheduleVersion: committed.scheduleVersion,
      planning: planningSnapshot(roomDoc),
    };
  }

  async updatePlanning(roomId: string, userId: string, dto: UpdatePlanningDto) {
    if (dto.timezone === null || dto.transportMode === null) {
      throw new BadRequestException(
        '시간대와 이동 수단은 null로 저장할 수 없습니다. 값을 선택해 주세요.',
      );
    }
    if (dto.confirm === null) {
      throw new BadRequestException('확정 여부는 true 또는 false여야 합니다.');
    }
    if (dto.timezone != null) assertTimeZone(dto.timezone);
    const hasChange =
      dto.timezone !== undefined ||
      dto.lodging !== undefined ||
      dto.returnPoint !== undefined ||
      dto.transportMode !== undefined ||
      dto.returnDeadline !== undefined ||
      dto.travelBufferMinutes !== undefined ||
      dto.prepBufferMinutes !== undefined;
    if (!hasChange) {
      throw new BadRequestException('변경할 여행 계획 정보를 입력해 주세요.');
    }

    const userObjectId = new Types.ObjectId(userId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await this.getRoomForOwner(roomId, userId);
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, 1> = {};
      if (dto.timezone !== undefined) $set.timezone = dto.timezone;
      if (dto.lodging !== undefined) {
        if (dto.lodging === null) $unset.lodging = 1;
        else $set.lodging = fromAnchorDto(dto.lodging);
      }
      if (dto.returnPoint !== undefined) {
        if (dto.returnPoint === null) $unset.returnPoint = 1;
        else $set.returnPoint = fromAnchorDto(dto.returnPoint);
      }
      if (dto.transportMode !== undefined) {
        $set.transportMode = setVersionedValue(
          room.transportMode,
          dto.transportMode,
          userId,
          dto.confirm,
        );
      }
      const versionedNullable: Array<
        [
          'returnDeadline' | 'travelBufferMinutes' | 'prepBufferMinutes',
          string | number | null | undefined,
        ]
      > = [
        ['returnDeadline', dto.returnDeadline],
        ['travelBufferMinutes', dto.travelBufferMinutes],
        ['prepBufferMinutes', dto.prepBufferMinutes],
      ];
      for (const [field, value] of versionedNullable) {
        if (value === undefined) continue;
        if (value === null) $unset[field] = 1;
        else {
          $set[field] = setVersionedValue(
            room[field],
            value,
            userId,
            dto.confirm,
          );
        }
      }

      const factsVersion = room.factsVersion ?? 0;
      const updated = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          factsVersion,
          members: { $elemMatch: { userId: userObjectId, role: 'owner' } },
        },
        {
          $set,
          ...(Object.keys($unset).length ? { $unset } : {}),
          $inc: { factsVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (updated) return planningSnapshot(updated);
    }
    throw new ConflictException({
      code: 'PLANNING_UPDATE_CONFLICT',
      message:
        '여행 계획이 동시에 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.',
    });
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

  async setScheduleStyle(
    roomId: string,
    userId: string,
    style: 'jType' | 'pType',
  ) {
    const room = await this.getRoomForMember(roomId, userId);
    room.scheduleStyle = style;
    await room.save();
    return { scheduleStyle: room.scheduleStyle };
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
    assertYmd(dto.startDate, 'startDate');
    assertYmd(dto.endDate, 'endDate');
    const startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${dto.endDate}T00:00:00.000Z`);
    if (endDate < startDate) {
      throw new BadRequestException(
        '여행 종료일은 시작일과 같거나 이후여야 합니다.',
      );
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
        const actionIds = (dto.itemActions ?? []).map(
          (action) => action.itemId,
        );
        if (new Set(actionIds).size !== actionIds.length) {
          throw new BadRequestException({
            code: 'DUPLICATE_TRIP_DATE_ACTION',
            message:
              '같은 일정에 대한 날짜 변경 작업을 중복 지정할 수 없습니다.',
          });
        }
        for (const action of dto.itemActions ?? []) {
          if (action.action === 'move' && action.day == null && !action.date) {
            throw new BadRequestException({
              code: 'MOVE_TARGET_REQUIRED',
              message: '일정을 옮기려면 이동할 DAY 또는 날짜가 필요합니다.',
              itemId: action.itemId,
            });
          }
        }
        const previousStartDate = room.startDate;
        room.startDate = startDate;
        room.endDate = endDate;

        const actions = new Map(
          (dto.itemActions ?? []).map((a) => [a.itemId, a]),
        );
        const allItems = room.schedule.days.flatMap((d) =>
          d.items.map((item) => ({ day: d.day, item })),
        );
        const existingItemIds = new Set(allItems.map(({ item }) => item.id));
        const unknownActionIds = actionIds.filter(
          (id) => !existingItemIds.has(id),
        );
        if (unknownActionIds.length) {
          throw new BadRequestException({
            code: 'SCHEDULE_ITEM_NOT_FOUND',
            message: '날짜 변경 대상 일정을 찾을 수 없습니다.',
            itemIds: unknownActionIds,
          });
        }

        for (const { item } of allItems) {
          const action = actions.get(item.id);
          const previousCalendarDate =
            item.date ??
            (previousStartDate
              ? dayToDate(previousStartDate, item.day)
              : undefined);
          const protectedCalendarDate =
            item.reservation?.status === 'confirmed' && item.reservation.date
              ? item.reservation.date
              : (item.tickets?.length ?? 0) > 0
                ? previousCalendarDate
                : undefined;
          if (
            item.reservation?.status === 'confirmed' &&
            item.reservation.date &&
            previousCalendarDate &&
            item.reservation.date !== previousCalendarDate &&
            action?.action !== 'delete'
          ) {
            throw new ConflictException({
              code: 'RESERVATION_DATE_MISMATCH',
              message:
                '확정 예약 날짜와 일정 날짜가 다릅니다. 예약 정보를 확인한 뒤 여행 날짜를 변경해 주세요.',
              itemId: item.id,
              scheduleDate: previousCalendarDate,
              reservationDate: item.reservation.date,
            });
          }
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
            const nextCalendarDate = dayToDate(startDate, item.day);
            if (
              (item.locked || protectedCalendarDate) &&
              previousCalendarDate &&
              nextCalendarDate !== previousCalendarDate
            ) {
              throw new ConflictException({
                code: 'PROTECTED_DATE_CHANGE_REQUIRES_ACTION',
                message:
                  '잠금 또는 예약·티켓이 있는 일정의 실제 날짜가 바뀝니다. 해당 일정을 명시적으로 이동하거나 삭제해 주세요.',
                itemId: item.id,
                currentDate: previousCalendarDate,
                nextDate: nextCalendarDate,
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
            filesToDelete.push(...(item.tickets ?? []).map((t) => t.imageUrl));
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
          if (
            protectedCalendarDate &&
            resolved.date !== protectedCalendarDate
          ) {
            throw new ConflictException({
              code: 'FIXED_BOOKING_DATE_CONFLICT',
              message:
                '예약·티켓이 연결된 일정은 실제 날짜를 바꿀 수 없습니다. 증빙을 먼저 확인하거나 삭제해 주세요.',
              itemId: item.id,
              protectedDate: protectedCalendarDate,
              requestedDate: resolved.date ?? null,
            });
          }
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

    const linkImpacts: Array<
      Awaited<ReturnType<RoomTodosService['detachScheduleItem']>>
    > = [];
    for (const id of detached) {
      const impact = await this.runPostCommit(
        '날짜 변경으로 삭제된 일정 TODO 연결 해제',
        () => this.todosService.detachScheduleItem(roomId, id),
      );
      if (impact) linkImpacts.push(impact);
    }

    const roomAfter =
      committed.room ?? (await this.getRoomForMember(roomId, userId));
    return {
      ...(committed.result ?? {
        startDate: roomAfter.startDate,
        endDate: roomAfter.endDate,
        days: roomAfter.schedule.days.map((day) => ({
          day: day.day,
          items: day.items.map((item) => serializeScheduleItem(item)),
        })),
      }),
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
    if (dto.expectedFactsVersion !== (roomPeek.factsVersion ?? 0)) {
      throw new ConflictException({
        code: 'FACTS_VERSION_CONFLICT',
        message: '분석 기준 데이터가 변경되었습니다. 다시 분석하세요.',
        currentFactsVersion: roomPeek.factsVersion ?? 0,
        expectedFactsVersion: dto.expectedFactsVersion,
      });
    }

    const protectedConflicts = findProtectedProposalConflicts(
      roomPeek.schedule.days,
      dto.days,
    );
    if (protectedConflicts.length) {
      throw new ConflictException({
        code: 'PROTECTED_SCHEDULE_CONFLICT',
        message:
          '잠금 또는 예약·티켓이 있는 일정은 제안 적용으로 변경할 수 없습니다.',
        items: protectedConflicts,
      });
    }

    // Reuse batch save with lock/reservation checks
    return this.saveSchedule(
      roomId,
      userId,
      {
        days: dto.days,
        expectedVersion: dto.expectedVersion,
        clientMutationId: dto.clientMutationId,
      },
      dto.expectedFactsVersion,
    );
  }

  async getMemberPreferences(roomId: string, userId: string) {
    let room = await this.getRoomForMember(roomId, userId);
    const memberIds = room.members.map((m) => m.userId);
    const users = await this.userModel.find({ _id: { $in: memberIds } });
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    // One-time backfill for rooms created before preference snapshots were
    // introduced. Each field uses its own conditional positional write so a
    // concurrent quiz/onboarding update cannot be overwritten by an older
    // User read. The schema keeps a missing legacy interest-tag array as
    // undefined, so completed rooms do not pay for no-op write probes.
    const backfills = room.members.flatMap((member) => {
      const user = byId.get(member.userId.toString());
      if (!user) return [];
      const writes = [];
      if (member.interestTagsSnapshot === undefined) {
        writes.push(
          this.roomModel.updateOne(
            {
              _id: room._id,
              members: {
                $elemMatch: {
                  userId: member.userId,
                  interestTagsSnapshot: { $exists: false },
                },
              },
            },
            {
              $set: {
                'members.$.interestTagsSnapshot': user.interestTags ?? [],
                'members.$.preferenceUpdatedAt': new Date(),
              },
              $inc: { factsVersion: 1 },
            },
          ),
        );
      }
      if (user.travelType && !member.travelTypeSnapshot) {
        writes.push(
          this.roomModel.updateOne(
            {
              _id: room._id,
              members: {
                $elemMatch: {
                  userId: member.userId,
                  travelTypeSnapshot: { $exists: false },
                },
              },
            },
            {
              $set: {
                'members.$.travelTypeSnapshot': user.travelType,
                'members.$.preferenceUpdatedAt': new Date(),
              },
              $inc: { factsVersion: 1 },
            },
          ),
        );
      }
      if (user.personalityAxes && !member.personalityAxesSnapshot) {
        writes.push(
          this.roomModel.updateOne(
            {
              _id: room._id,
              members: {
                $elemMatch: {
                  userId: member.userId,
                  personalityAxesSnapshot: { $exists: false },
                },
              },
            },
            {
              $set: {
                'members.$.personalityAxesSnapshot': user.personalityAxes,
                'members.$.preferenceUpdatedAt': new Date(),
              },
              $inc: { factsVersion: 1 },
            },
          ),
        );
      }
      if (!member.mobilityConstraints) {
        writes.push(
          this.roomModel.updateOne(
            {
              _id: room._id,
              members: {
                $elemMatch: {
                  userId: member.userId,
                  mobilityConstraints: { $exists: false },
                },
              },
            },
            {
              $set: {
                'members.$.mobilityConstraints': this.snapshotConstraints(user),
              },
              $inc: { factsVersion: 1 },
            },
          ),
        );
      }
      return writes;
    });
    if (backfills.length) {
      const results = await Promise.all(backfills);
      if (results.some((result) => result.modifiedCount > 0)) {
        room = await this.getRoomForMember(roomId, userId);
      }
    }

    const members = room.members.map((m) => {
      const uid = m.userId.toString();
      const user = byId.get(uid);
      const axes = m.personalityAxesSnapshot;
      const constraints = m.mobilityConstraints ?? {
        values: [],
        status: 'missing',
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
        interestTags: m.interestTagsSnapshot ?? [],
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
    if (
      dto.mustVisit === undefined &&
      dto.avoid === undefined &&
      dto.preferenceStrength === undefined
    ) {
      throw new BadRequestException({
        code: 'EMPTY_CANDIDATE_SIGNAL',
        message: '변경할 장소 의견을 하나 이상 입력해 주세요.',
      });
    }
    const userObjectId = new Types.ObjectId(userId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await this.getRoomForMember(roomId, userId);
      const placeObjectId = new Types.ObjectId(placeId);
      const candidates = room.candidatePlaces.filter((entry) =>
        entry.placeId.equals(placeObjectId),
      );
      if (candidates.length === 0) {
        throw new NotFoundException('후보 장소를 찾을 수 없습니다.');
      }
      const mergedSignals = mergeCandidateSignals(candidates);
      let signal = mergedSignals.find((entry) =>
        entry.userId.equals(userObjectId),
      );
      if (!signal) {
        signal = {
          userId: userObjectId,
          version: 0,
          updatedAt: new Date(),
        };
        mergedSignals.push(signal);
      }
      if (dto.mustVisit !== undefined) signal.mustVisit = dto.mustVisit;
      if (dto.avoid !== undefined) signal.avoid = dto.avoid;
      if (dto.preferenceStrength !== undefined) {
        signal.preferenceStrength = dto.preferenceStrength;
      }
      if (signal.mustVisit && signal.avoid) {
        throw new BadRequestException({
          code: 'CONFLICTING_CANDIDATE_SIGNAL',
          message: '같은 장소를 필수 방문과 제외로 동시에 표시할 수 없습니다.',
        });
      }
      signal.version = (signal.version ?? 0) + 1;
      signal.updatedAt = new Date();
      for (const candidate of candidates) {
        candidate.memberSignals = mergedSignals.map(cloneCandidateSignal);
      }

      const factsVersion = room.factsVersion ?? 0;
      const scheduleVersion = room.scheduleVersion ?? 0;
      const updated = await this.roomModel.findOneAndUpdate(
        {
          _id: room._id,
          'members.userId': userObjectId,
          factsVersion,
          scheduleVersion,
        },
        {
          $set: { candidatePlaces: room.candidatePlaces },
          $inc: { factsVersion: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!updated) continue;
      const persistedSignal = updated.candidatePlaces
        .filter((entry) => entry.placeId.equals(placeObjectId))
        .flatMap((entry) => entry.memberSignals ?? [])
        .find((entry) => entry.userId.equals(userObjectId));
      if (!persistedSignal) {
        throw new ConflictException({
          code: 'CANDIDATE_SIGNAL_CONFLICT',
          message:
            '장소 의견이 동시에 변경되었습니다. 최신 목록을 불러온 뒤 다시 시도해 주세요.',
        });
      }
      return {
        placeId,
        signal: {
          userId,
          mustVisit: persistedSignal.mustVisit ?? null,
          avoid: persistedSignal.avoid ?? null,
          preferenceStrength:
            persistedSignal.preferenceStrength === undefined
              ? null
              : persistedSignal.preferenceStrength,
          version: persistedSignal.version,
          updatedAt: persistedSignal.updatedAt,
        },
        factsVersion: updated.factsVersion ?? factsVersion + 1,
      };
    }
    throw new ConflictException({
      code: 'CANDIDATE_SIGNAL_CONFLICT',
      message:
        '장소 의견이 동시에 변경되었습니다. 최신 목록을 불러온 뒤 다시 시도해 주세요.',
    });
  }

  async refreshMyConstraints(roomId: string, userId: string) {
    await this.getRoomForMember(roomId, userId);
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();
    const updated = await this.roomModel.findOneAndUpdate(
      { _id: new Types.ObjectId(roomId), 'members.userId': userObjectId },
      {
        $set: {
          'members.$.mobilityConstraints.values':
            user.mobilityConstraints ?? [],
          'members.$.mobilityConstraints.status':
            user.onboardingCompleted || user.mobilityConstraints?.length
              ? 'present'
              : 'missing',
          'members.$.mobilityConstraints.source': 'user',
          'members.$.mobilityConstraints.updatedAt': now,
          'members.$.travelTypeSnapshot': user.travelType,
          'members.$.personalityAxesSnapshot': user.personalityAxes,
          'members.$.interestTagsSnapshot': user.interestTags ?? [],
          'members.$.preferenceUpdatedAt': now,
        },
        $inc: {
          'members.$.mobilityConstraints.version': 1,
          factsVersion: 1,
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ForbiddenException({
        code: 'ROOM_MEMBER_REQUIRED',
        message: '이 여행방에 참여한 사용자만 이용할 수 있습니다.',
      });
    }
    const member = updated.members.find((entry) =>
      entry.userId.equals(userObjectId),
    )!;
    return {
      mobilityConstraints: member.mobilityConstraints,
      factsVersion: updated.factsVersion ?? 0,
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
      inviteLink: this.inviteLink(room.inviteCode),
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

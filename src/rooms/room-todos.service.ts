import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  RoomTodo,
  RoomTodoDocument,
  TodoChecklistItem,
  TodoLink,
} from '../schemas/room-todo.schema';
import {
  assertRoomMember,
  assertTodoMutator,
  requireRoom,
} from './room-access';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import {
  CreateRoomTodoDto,
  ResolveAutoTodosDto,
  TodoChecklistItemDto,
  TodoLinkDto,
  UpdateRoomTodoDto,
} from './dto/room-todo.dto';
import {
  RoomDocumentFile,
  RoomDocumentDoc,
} from '../schemas/room-document.schema';
import { assertHhMm, assertTimeZone, assertYmd } from './schedule.validation';

function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class RoomTodosService {
  constructor(
    @InjectModel(RoomTodo.name) private todoModel: Model<RoomTodoDocument>,
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
    @InjectModel(RoomDocumentFile.name)
    private documentModel: Model<RoomDocumentDoc>,
  ) {}

  private async getRoomForMember(roomId: string, userId: string) {
    const room = requireRoom(await this.roomModel.findById(roomId));
    const member = assertRoomMember(room, userId);
    return { room, role: member.role };
  }

  private assertAssigneeInRoom(
    room: TravelRoomDocument,
    assigneeId?: string | null,
  ) {
    if (!assigneeId) return;
    const ok = room.members.some((m) => m.userId.toString() === assigneeId);
    if (!ok) {
      throw new BadRequestException(
        '담당자는 현재 여행방 참여자만 지정할 수 있습니다',
      );
    }
  }

  private async assertLinksInRoom(
    room: TravelRoomDocument,
    links: TodoLinkDto[],
  ) {
    const itemIds = new Set(
      room.schedule.days.flatMap((d) => d.items.map((i) => i.id)),
    );
    const ticketItemById = new Map(
      room.schedule.days.flatMap((d) =>
        d.items.flatMap((i) =>
          (i.tickets ?? []).map((t) => [t.id, i.id] as const),
        ),
      ),
    );
    const reservationItemById = new Map(
      room.schedule.days
        .flatMap((d) => d.items)
        .filter((i) => Boolean(i.reservation?.id))
        .map((i) => [i.reservation!.id, i.id] as const),
    );
    const documentIds = new Set<string>();

    for (const link of links) {
      if (link.type === 'scheduleItem' && !itemIds.has(link.targetId)) {
        throw new BadRequestException(
          `일정 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (link.type === 'ticket' && !ticketItemById.has(link.targetId)) {
        throw new BadRequestException(
          `티켓 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (
        link.type === 'reservation' &&
        !reservationItemById.has(link.targetId)
      ) {
        throw new BadRequestException(
          `예약 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (link.type === 'document') {
        if (!Types.ObjectId.isValid(link.targetId)) {
          throw new BadRequestException(
            `문서 연결 대상 ID가 올바르지 않습니다: ${link.targetId}`,
          );
        }
        documentIds.add(link.targetId);
      }
      if (link.scheduleItemId && !itemIds.has(link.scheduleItemId)) {
        throw new BadRequestException(
          `scheduleItemId가 이 여행방에 없습니다: ${link.scheduleItemId}`,
        );
      }
      const actualScheduleItemId =
        link.type === 'ticket'
          ? ticketItemById.get(link.targetId)
          : link.type === 'reservation'
            ? reservationItemById.get(link.targetId)
            : undefined;
      if (
        link.scheduleItemId &&
        actualScheduleItemId &&
        link.scheduleItemId !== actualScheduleItemId
      ) {
        throw new BadRequestException(
          `연결 대상과 scheduleItemId가 일치하지 않습니다: ${link.targetId}`,
        );
      }
    }

    if (documentIds.size > 0) {
      const count = await this.documentModel.countDocuments({
        _id: { $in: [...documentIds].map((id) => new Types.ObjectId(id)) },
        roomId: room._id,
        creatingAt: { $exists: false },
        deletingAt: { $exists: false },
      });
      if (count !== documentIds.size) {
        throw new BadRequestException(
          '문서 연결 대상 중 현재 여행방에 없는 문서가 있습니다.',
        );
      }
    }
  }

  private documentLinkIds(links?: TodoLinkDto[]) {
    return [
      ...new Set(
        (links ?? [])
          .filter((link) => link.type === 'document')
          .map((link) => link.targetId),
      ),
    ].sort();
  }

  /**
   * A short database lease serializes TODO link writes with document deletion
   * even on a standalone MongoDB used for local development. Deletion marks
   * its tombstone only when no live lease exists.
   */
  private async withDocumentLinkLeases<TResult>(
    roomId: string,
    links: TodoLinkDto[] | undefined,
    task: () => Promise<TResult>,
  ) {
    const ids = this.documentLinkIds(links);
    if (!ids.length) return task();
    const token = randomUUID();
    const acquired: Types.ObjectId[] = [];
    try {
      for (const id of ids) {
        const now = new Date();
        const documentId = new Types.ObjectId(id);
        const locked = await this.documentModel.findOneAndUpdate(
          {
            _id: documentId,
            roomId: new Types.ObjectId(roomId),
            creatingAt: { $exists: false },
            deletingAt: { $exists: false },
            $or: [
              { linkMutationExpiresAt: { $exists: false } },
              { linkMutationExpiresAt: { $lte: now } },
            ],
          },
          {
            $set: {
              linkMutationToken: token,
              linkMutationExpiresAt: new Date(now.getTime() + 30_000),
            },
          },
          { returnDocument: 'after' },
        );
        if (!locked) {
          throw new ConflictException({
            code: 'DOCUMENT_LINK_CHANGED',
            message:
              '문서가 삭제 중이거나 다른 TODO에 연결 중입니다. 문서 목록을 새로 불러온 뒤 다시 시도해 주세요.',
            documentId: id,
          });
        }
        acquired.push(documentId);
      }
      return await task();
    } finally {
      if (acquired.length) {
        await this.documentModel.updateMany(
          { _id: { $in: acquired }, linkMutationToken: token },
          {
            $unset: {
              linkMutationToken: 1,
              linkMutationExpiresAt: 1,
            },
          },
        );
      }
    }
  }

  private mapChecklist(
    items?: TodoChecklistItemDto[],
    previous: TodoChecklistItem[] = [],
    actorUserId?: string,
  ): TodoChecklistItem[] {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const now = new Date();
    const mapped = (items ?? []).map((c, idx) => {
      const id = c.id?.trim() || `chk-${Date.now()}-${idx}`;
      const prior = previousById.get(id);
      const done = !!c.done;
      return {
        id,
        title: c.title.trim(),
        done,
        doneAt: done ? (prior?.doneAt ?? now) : undefined,
        doneBy: done
          ? (prior?.doneBy ??
            (actorUserId ? new Types.ObjectId(actorUserId) : undefined))
          : undefined,
      };
    });
    if (mapped.some((item) => !item.title)) {
      throw new BadRequestException('체크리스트 제목을 입력해 주세요.');
    }
    if (new Set(mapped.map((item) => item.id)).size !== mapped.length) {
      throw new BadRequestException('체크리스트 ID가 중복되었습니다.');
    }
    return mapped;
  }

  private validateDueFields(dueDate?: string | null, dueTime?: string | null) {
    if (dueDate) assertYmd(dueDate, 'dueDate');
    if (dueTime) assertHhMm(dueTime, 'dueTime');
    if (dueTime && !dueDate) {
      throw new BadRequestException(
        '마감 시간을 지정하려면 마감 날짜도 필요합니다.',
      );
    }
  }

  private mapLinks(links?: TodoLinkDto[]): TodoLink[] {
    return (links ?? []).map((l) => ({
      type: l.type,
      targetId: l.targetId,
      scheduleItemId: l.scheduleItemId,
    }));
  }

  toDto(todo: RoomTodoDocument) {
    const timestamps = todo as RoomTodoDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      id: todo._id.toString(),
      roomId: todo.roomId.toString(),
      title: todo.title,
      description: todo.description ?? '',
      status: todo.status,
      priority: todo.priority,
      dueDate: todo.dueDate ?? null,
      dueTime: todo.dueTime ?? null,
      hasDueTime: !!todo.dueTime,
      timezone: todo.timezone ?? 'Asia/Seoul',
      assigneeId: todo.assigneeId?.toString() ?? null,
      checklist: (todo.checklist ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        done: c.done,
        doneAt: c.doneAt ?? null,
        doneBy: c.doneBy?.toString() ?? null,
      })),
      links: (todo.links ?? []).map((l) => ({
        type: l.type,
        targetId: l.targetId,
        scheduleItemId: l.scheduleItemId ?? null,
      })),
      source: {
        kind: todo.source?.kind ?? 'manual',
        dedupeKey: todo.source?.dedupeKey ?? null,
        cause: todo.source?.cause ?? null,
        baseRevision: todo.source?.baseRevision ?? null,
        userEdited: !!todo.source?.userEdited,
        suppressed: !!todo.source?.suppressed,
      },
      archived: !!todo.archived,
      createdBy: todo.createdBy.toString(),
      updatedBy: todo.updatedBy?.toString() ?? null,
      completedAt: todo.completedAt ?? null,
      completedBy: todo.completedBy?.toString() ?? null,
      revision: todo.revision ?? 1,
      createdAt: timestamps.createdAt ?? null,
      updatedAt: timestamps.updatedAt ?? null,
    };
  }

  private todoConflict(todo: RoomTodoDocument, expectedRevision: number) {
    return new ConflictException({
      code: 'TODO_REVISION_CONFLICT',
      message: 'TODO가 다른 참여자에 의해 먼저 수정되었습니다.',
      expectedRevision,
      currentRevision: todo.revision ?? 1,
      todo: this.toDto(todo),
    });
  }

  private async reuseOrReopenDedupedTodo(
    room: TravelRoomDocument,
    userId: string,
    existing: RoomTodoDocument,
    dto: CreateRoomTodoDto,
    enforceTodoMutator: boolean,
  ) {
    const requestedKind = dto.source?.kind ?? 'manual';
    const requestedBaseRevision = this.numericBaseRevision(
      dto.source?.baseRevision,
    );
    let current = existing;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const existingKind = current.source?.kind ?? 'manual';
      if (requestedKind !== existingKind) {
        throw new ConflictException({
          code: 'TODO_DEDUPE_SOURCE_CONFLICT',
          message:
            '같은 중복 방지 키가 다른 종류의 TODO에 사용되었습니다. 최신 TODO 목록을 확인해 주세요.',
          dedupeKey: dto.source?.dedupeKey,
        });
      }
      if (current.source?.suppressed || current.source?.userEdited) {
        return {
          ...this.toDto(current),
          idempotent: true,
          suppressed: !!current.source?.suppressed,
        };
      }
      const existingBaseRevision = this.numericBaseRevision(
        current.source?.baseRevision,
      );
      if (
        requestedBaseRevision !== null &&
        existingBaseRevision !== null &&
        requestedBaseRevision < existingBaseRevision
      ) {
        return { ...this.toDto(current), idempotent: true, staleCause: true };
      }
      const shouldReopen =
        current.archived ||
        current.status === 'done' ||
        current.status === 'cancelled';
      const shouldRefreshCause =
        requestedBaseRevision !== null &&
        (existingBaseRevision === null ||
          requestedBaseRevision > existingBaseRevision);
      if (
        requestedKind === 'manual' ||
        (!shouldReopen && !shouldRefreshCause)
      ) {
        return { ...this.toDto(current), idempotent: true };
      }
      if (enforceTodoMutator) {
        assertTodoMutator(room, userId, current);
      }

      const $set: Record<string, unknown> = {
        title: dto.title.trim(),
        description: dto.description ?? '',
        priority: dto.priority ?? 'medium',
        updatedBy: new Types.ObjectId(userId),
        'source.kind': requestedKind,
        'source.userEdited': false,
        'source.suppressed': false,
      };
      if (dto.source?.cause !== undefined) {
        $set['source.cause'] = dto.source.cause;
      }
      if (dto.source?.baseRevision !== undefined) {
        $set['source.baseRevision'] = dto.source.baseRevision;
      }
      if (dto.links) $set.links = this.mapLinks(dto.links);
      if (shouldReopen) {
        $set.status = 'open';
        $set.archived = false;
      }
      const updated = await this.todoModel.findOneAndUpdate(
        {
          _id: current._id,
          roomId: room._id,
          revision: current.revision ?? 1,
          'source.kind': requestedKind,
          'source.userEdited': { $ne: true },
          'source.suppressed': { $ne: true },
        },
        {
          $set,
          ...(shouldReopen
            ? { $unset: { completedAt: 1, completedBy: 1 } }
            : {}),
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (updated) {
        return {
          ...this.toDto(updated),
          idempotent: true,
          ...(shouldReopen ? { reopened: true } : { causeRefreshed: true }),
        };
      }
      const latest = await this.todoModel.findOne({
        _id: current._id,
        roomId: room._id,
      });
      if (!latest) break;
      current = latest;
    }
    throw new ConflictException({
      code: 'TODO_REOPEN_CONFLICT',
      message: 'TODO 상태가 동시에 변경되었습니다. 다시 시도해 주세요.',
    });
  }

  private numericBaseRevision(value: string | null | undefined) {
    if (!value || !/^\d+$/.test(value)) return null;
    const revision = Number(value);
    return Number.isSafeInteger(revision) ? revision : null;
  }

  async list(
    roomId: string,
    userId: string,
    query: {
      status?: string;
      assigneeId?: string;
      dueDate?: string;
      archived?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.getRoomForMember(roomId, userId);
    const page =
      Number.isInteger(query.page) && (query.page ?? 0) > 0 ? query.page! : 1;
    const limit =
      Number.isInteger(query.limit) && (query.limit ?? 0) > 0
        ? Math.min(100, query.limit!)
        : 50;
    const filter: Record<string, unknown> = {
      roomId: new Types.ObjectId(roomId),
    };
    if (query.status) {
      if (
        !['open', 'in_progress', 'done', 'cancelled'].includes(query.status)
      ) {
        throw new BadRequestException('TODO 상태 필터가 올바르지 않습니다.');
      }
      filter.status = query.status;
    }
    if (query.assigneeId) {
      if (!Types.ObjectId.isValid(query.assigneeId)) {
        throw new BadRequestException(
          '담당자 식별자 형식이 올바르지 않습니다.',
        );
      }
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    }
    if (query.dueDate) {
      assertYmd(query.dueDate, 'dueDate');
      filter.dueDate = query.dueDate;
    }
    if (query.archived && !['true', 'false', 'all'].includes(query.archived)) {
      throw new BadRequestException(
        'archived는 true, false, all 중 하나여야 합니다.',
      );
    }
    if (query.archived === 'true') filter.archived = true;
    else if (query.archived !== 'all') filter.archived = { $ne: true };

    // One aggregation keeps page data and total on the same command snapshot.
    // Enum strings are not priority ordered lexicographically, so rank them
    // explicitly before pagination.
    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $set: {
          __priorityRank: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'urgent'] }, then: 4 },
                { case: { $eq: ['$priority', 'high'] }, then: 3 },
                { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                { case: { $eq: ['$priority', 'low'] }, then: 1 },
              ],
              default: 0,
            },
          },
          __dueDateRank: {
            $cond: [{ $eq: [{ $type: '$dueDate' }, 'string'] }, 0, 1],
          },
        },
      },
      {
        $sort: {
          __priorityRank: -1,
          __dueDateRank: 1,
          dueDate: 1,
          dueTime: 1,
          updatedAt: -1,
          _id: 1,
        },
      },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $unset: ['__priorityRank', '__dueDateRank'] },
          ],
          totals: [{ $count: 'value' }],
        },
      },
    ];
    const [result] = await this.todoModel
      .aggregate<{
        data: RoomTodoDocument[];
        totals: Array<{ value: number }>;
      }>(pipeline)
      .exec();
    const docs = result?.data ?? [];
    const total = result?.totals[0]?.value ?? 0;

    return {
      data: docs.map((t) => this.toDto(t)),
      meta: { total, page, limit },
    };
  }

  async create(
    roomId: string,
    userId: string,
    dto: CreateRoomTodoDto,
    enforceExistingTodoMutator = true,
  ) {
    if (
      enforceExistingTodoMutator &&
      dto.source?.dedupeKey &&
      /^(scheduleChange|ocrConfirm):/.test(dto.source.dedupeKey)
    ) {
      throw new BadRequestException({
        code: 'TODO_DEDUPE_RESERVED',
        message: '이 중복 방지 키는 일정·예약 자동 TODO 전용입니다.',
      });
    }
    const documentIds = this.documentLinkIds(dto.links);
    if (documentIds.length) {
      const { room } = await this.getRoomForMember(roomId, userId);
      await this.assertLinksInRoom(room, dto.links ?? []);
      return this.withDocumentLinkLeases(roomId, dto.links, () =>
        this.createUnlocked(roomId, userId, dto, enforceExistingTodoMutator),
      );
    }
    return this.createUnlocked(roomId, userId, dto, enforceExistingTodoMutator);
  }

  private async createUnlocked(
    roomId: string,
    userId: string,
    dto: CreateRoomTodoDto,
    enforceExistingTodoMutator: boolean,
  ) {
    const { room } = await this.getRoomForMember(roomId, userId);
    this.assertAssigneeInRoom(room, dto.assigneeId);
    this.validateDueFields(dto.dueDate, dto.dueTime);
    if (dto.timezone) assertTimeZone(dto.timezone);
    if (dto.links?.length) await this.assertLinksInRoom(room, dto.links);
    if (!dto.title.trim()) {
      throw new BadRequestException('TODO 제목을 입력해 주세요.');
    }

    if (dto.source?.dedupeKey) {
      const existing = await this.todoModel.findOne({
        roomId: room._id,
        'source.dedupeKey': dto.source.dedupeKey,
      });
      if (existing) {
        return this.reuseOrReopenDedupedTodo(
          room,
          userId,
          existing,
          dto,
          enforceExistingTodoMutator,
        );
      }
    }

    if (dto.clientMutationId) {
      const byMutation = await this.todoModel.findOne({
        roomId: room._id,
        lastMutationId: dto.clientMutationId,
      });
      if (byMutation) {
        return { ...this.toDto(byMutation), idempotent: true };
      }
    }

    try {
      const created = await this.todoModel.create({
        roomId: room._id,
        title: dto.title.trim(),
        description: dto.description ?? '',
        status: dto.status ?? 'open',
        priority: dto.priority ?? 'medium',
        dueDate: dto.dueDate,
        dueTime: dto.dueTime,
        timezone: dto.timezone ?? room.timezone ?? 'Asia/Seoul',
        assigneeId: dto.assigneeId
          ? new Types.ObjectId(dto.assigneeId)
          : undefined,
        checklist: this.mapChecklist(dto.checklist, [], userId),
        links: this.mapLinks(dto.links),
        source: {
          kind: dto.source?.kind ?? 'manual',
          dedupeKey: dto.source?.dedupeKey,
          cause: dto.source?.cause,
          baseRevision: dto.source?.baseRevision,
          userEdited: false,
          suppressed: false,
        },
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
        completedAt: dto.status === 'done' ? new Date() : undefined,
        completedBy:
          dto.status === 'done' ? new Types.ObjectId(userId) : undefined,
        revision: 1,
        lastMutationId: dto.clientMutationId,
      });
      return this.toDto(created);
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error) && dto.source?.dedupeKey) {
        const existing = await this.todoModel.findOne({
          roomId: room._id,
          'source.dedupeKey': dto.source.dedupeKey,
        });
        if (existing) {
          return this.reuseOrReopenDedupedTodo(
            room,
            userId,
            existing,
            dto,
            enforceExistingTodoMutator,
          );
        }
      }
      if (isMongoDuplicateKeyError(error) && dto.clientMutationId) {
        const existing = await this.todoModel.findOne({
          roomId: room._id,
          lastMutationId: dto.clientMutationId,
        });
        if (existing) return { ...this.toDto(existing), idempotent: true };
      }
      throw error;
    }
  }

  async update(
    roomId: string,
    userId: string,
    todoId: string,
    dto: UpdateRoomTodoDto,
  ) {
    const documentIds = this.documentLinkIds(dto.links);
    if (documentIds.length) {
      const { room } = await this.getRoomForMember(roomId, userId);
      await this.assertLinksInRoom(room, dto.links ?? []);
      return this.withDocumentLinkLeases(roomId, dto.links, () =>
        this.updateUnlocked(roomId, userId, todoId, dto),
      );
    }
    return this.updateUnlocked(roomId, userId, todoId, dto);
  }

  private async updateUnlocked(
    roomId: string,
    userId: string,
    todoId: string,
    dto: UpdateRoomTodoDto,
  ) {
    const { room } = await this.getRoomForMember(roomId, userId);
    const todo = await this.todoModel.findOne({
      _id: todoId,
      roomId: room._id,
    });
    if (!todo) throw new NotFoundException('TODO를 찾을 수 없습니다.');
    const member = assertTodoMutator(room, userId, todo);
    const mutationAuthority =
      member.role === 'owner'
        ? {}
        : {
            $or: [
              { createdBy: new Types.ObjectId(userId) },
              { assigneeId: new Types.ObjectId(userId) },
            ],
          };

    if (dto.clientMutationId && todo.lastMutationId === dto.clientMutationId) {
      return { ...this.toDto(todo), idempotent: true };
    }

    if (dto.expectedRevision !== (todo.revision ?? 1)) {
      throw this.todoConflict(todo, dto.expectedRevision);
    }

    if (dto.assigneeId !== undefined) {
      this.assertAssigneeInRoom(room, dto.assigneeId);
    }
    if (dto.links) await this.assertLinksInRoom(room, dto.links);
    const nextDueDate = dto.dueDate === undefined ? todo.dueDate : dto.dueDate;
    const nextDueTime = dto.dueTime === undefined ? todo.dueTime : dto.dueTime;
    this.validateDueFields(nextDueDate, nextDueTime);
    if (dto.timezone) assertTimeZone(dto.timezone);
    if (dto.title !== undefined && !dto.title.trim()) {
      throw new BadRequestException('TODO 제목을 입력해 주세요.');
    }

    const userFieldsTouched =
      dto.title != null ||
      dto.description != null ||
      dto.dueDate !== undefined ||
      dto.dueTime !== undefined ||
      dto.status != null ||
      dto.priority != null ||
      dto.timezone != null ||
      dto.assigneeId !== undefined ||
      dto.checklist != null ||
      dto.links != null ||
      dto.archived != null;

    const $set: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(userId),
      revision: (todo.revision ?? 1) + 1,
    };
    const $unset: Record<string, 1> = {};
    if (dto.clientMutationId) $set.lastMutationId = dto.clientMutationId;
    if (dto.title != null) $set.title = dto.title.trim();
    if (dto.description != null) $set.description = dto.description;
    if (dto.status != null) {
      $set.status = dto.status;
      if (dto.status === 'done') {
        if (todo.status !== 'done') {
          $set.completedAt = new Date();
          $set.completedBy = new Types.ObjectId(userId);
        }
      } else {
        $unset.completedAt = 1;
        $unset.completedBy = 1;
      }
    }
    if (dto.priority != null) $set.priority = dto.priority;
    if (dto.dueDate !== undefined) {
      if (dto.dueDate == null) $unset.dueDate = 1;
      else $set.dueDate = dto.dueDate;
    }
    if (dto.dueTime !== undefined) {
      if (dto.dueTime == null) $unset.dueTime = 1;
      else $set.dueTime = dto.dueTime;
    }
    if (dto.timezone != null) $set.timezone = dto.timezone;
    if (dto.assigneeId !== undefined) {
      $set.assigneeId = dto.assigneeId
        ? new Types.ObjectId(dto.assigneeId)
        : null;
    }
    if (dto.checklist) {
      $set.checklist = this.mapChecklist(dto.checklist, todo.checklist, userId);
    }
    if (dto.links) $set.links = this.mapLinks(dto.links);
    if (dto.archived != null) {
      $set.archived = dto.archived;
      if (dto.archived && todo.source?.kind !== 'manual') {
        $set['source.suppressed'] = true;
      }
    }
    if (userFieldsTouched && todo.source?.kind !== 'manual') {
      $set['source.userEdited'] = true;
    }

    const updated = await this.todoModel.findOneAndUpdate(
      {
        _id: todo._id,
        roomId: room._id,
        revision: dto.expectedRevision,
        ...mutationAuthority,
      },
      { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      { returnDocument: 'after' },
    );

    if (!updated) {
      const latest = await this.todoModel.findById(todoId);
      if (!latest) throw new NotFoundException('TODO를 찾을 수 없습니다.');
      if (
        dto.clientMutationId &&
        latest.lastMutationId === dto.clientMutationId
      ) {
        return { ...this.toDto(latest), idempotent: true };
      }
      assertTodoMutator(room, userId, latest);
      throw this.todoConflict(latest, dto.expectedRevision);
    }

    return this.toDto(updated);
  }

  async remove(
    roomId: string,
    userId: string,
    todoId: string,
    expectedRevision: number,
    clientMutationId?: string,
  ) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new BadRequestException(
        'expectedRevision은 1 이상의 정수여야 합니다.',
      );
    }
    const { room } = await this.getRoomForMember(roomId, userId);
    const todo = await this.todoModel.findOne({
      _id: todoId,
      roomId: room._id,
    });
    if (!todo) throw new NotFoundException('TODO를 찾을 수 없습니다.');
    const member = assertTodoMutator(room, userId, todo);
    const mutationAuthority =
      member.role === 'owner'
        ? {}
        : {
            $or: [
              { createdBy: new Types.ObjectId(userId) },
              { assigneeId: new Types.ObjectId(userId) },
            ],
          };
    if (
      clientMutationId &&
      todo.lastMutationId === clientMutationId &&
      todo.source?.kind !== 'manual' &&
      todo.archived &&
      todo.source.suppressed
    ) {
      return {
        success: true,
        suppressed: true,
        revision: todo.revision,
        todo: this.toDto(todo),
        idempotent: true,
      };
    }
    if (expectedRevision !== (todo.revision ?? 1)) {
      throw this.todoConflict(todo, expectedRevision);
    }

    // Soft-delete for auto todos → suppress recreate; hard delete manual
    if (todo.source?.kind && todo.source.kind !== 'manual') {
      const updated = await this.todoModel.findOneAndUpdate(
        {
          _id: todo._id,
          roomId: room._id,
          revision: expectedRevision,
          ...mutationAuthority,
        },
        {
          $set: {
            archived: true,
            'source.suppressed': true,
            updatedBy: new Types.ObjectId(userId),
            revision: expectedRevision + 1,
            ...(clientMutationId ? { lastMutationId: clientMutationId } : {}),
          },
        },
        { returnDocument: 'after' },
      );
      if (!updated) {
        const latest = await this.todoModel.findById(todoId);
        if (!latest) throw new NotFoundException('TODO를 찾을 수 없습니다.');
        assertTodoMutator(room, userId, latest);
        throw this.todoConflict(latest, expectedRevision);
      }
      return {
        success: true,
        suppressed: true,
        revision: updated.revision,
        todo: this.toDto(updated),
      };
    }

    const deleted = await this.todoModel.findOneAndDelete({
      _id: todo._id,
      roomId: room._id,
      revision: expectedRevision,
      ...mutationAuthority,
    });
    if (!deleted) {
      const latest = await this.todoModel.findById(todoId);
      if (!latest) throw new NotFoundException('TODO를 찾을 수 없습니다.');
      assertTodoMutator(room, userId, latest);
      throw this.todoConflict(latest, expectedRevision);
    }
    return { success: true, deleted: true };
  }

  /**
   * When a cause is resolved, auto-close only non-user-edited todos.
   */
  async resolveAuto(roomId: string, userId: string, dto: ResolveAutoTodosDto) {
    return this.resolveAutoInternal(roomId, userId, dto, true);
  }

  /** Causal schedule/ticket mutations may resolve their own system TODOs. */
  async resolveAutoSystem(
    roomId: string,
    userId: string,
    dto: ResolveAutoTodosDto,
  ) {
    return this.resolveAutoInternal(roomId, userId, dto, false);
  }

  private async resolveAutoInternal(
    roomId: string,
    userId: string,
    dto: ResolveAutoTodosDto,
    enforceTodoMutator: boolean,
  ) {
    const { room } = await this.getRoomForMember(roomId, userId);
    const filter: Record<string, unknown> = {
      roomId: room._id,
      'source.dedupeKey': dto.dedupeKey,
      'source.userEdited': { $ne: true },
      'source.suppressed': { $ne: true },
      status: { $nin: ['done', 'cancelled'] },
      archived: { $ne: true },
    };
    if (dto.expectedScheduleVersion !== undefined) {
      filter.$expr = {
        $lte: [
          {
            $convert: {
              input: '$source.baseRevision',
              to: 'long',
              onError: -1,
              onNull: -1,
            },
          },
          dto.expectedScheduleVersion,
        ],
      };
    }
    if (enforceTodoMutator) {
      const member = assertRoomMember(room, userId);
      if (member.role !== 'owner') {
        const actorId = new Types.ObjectId(userId);
        // Keep authorization in the write predicate. A concurrent assignee
        // change can no longer turn a previously authorized read into an
        // unauthorized bulk update.
        filter.$or = [{ createdBy: actorId }, { assigneeId: actorId }];
      }
    }
    const resolvedAt = new Date();
    const $set: Record<string, unknown> = {
      status: 'done',
      completedAt: resolvedAt,
      completedBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    };
    if (dto.expectedScheduleVersion !== undefined) {
      $set['source.baseRevision'] = String(dto.expectedScheduleVersion);
    }
    const result = await this.todoModel.updateMany(filter, {
      $set,
      $inc: { revision: 1 },
    });
    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      preservedUserEdited: true,
    };
  }

  /**
   * Detach links when schedule item removed — does not delete todos.
   */
  async detachScheduleItem(roomId: string, scheduleItemId: string) {
    const res = await this.todoModel.updateMany(
      {
        roomId: new Types.ObjectId(roomId),
        $or: [
          {
            links: {
              $elemMatch: { type: 'scheduleItem', targetId: scheduleItemId },
            },
          },
          { links: { $elemMatch: { scheduleItemId } } },
        ],
      },
      [
        {
          $set: {
            links: {
              $filter: {
                input: '$links',
                as: 'l',
                cond: {
                  $and: [
                    {
                      $not: {
                        $and: [
                          { $eq: ['$$l.type', 'scheduleItem'] },
                          { $eq: ['$$l.targetId', scheduleItemId] },
                        ],
                      },
                    },
                    { $ne: ['$$l.scheduleItemId', scheduleItemId] },
                  ],
                },
              },
            },
            revision: { $add: ['$revision', 1] },
          },
        },
      ],
    );
    return {
      action: 'unlinked' as const,
      matched: res.matchedCount,
      modified: res.modifiedCount,
      scheduleItemId,
    };
  }

  async detachLinkedTarget(
    roomId: string,
    type: 'reservation' | 'ticket' | 'document',
    targetId: string,
    session?: ClientSession,
  ) {
    const res = await this.todoModel.updateMany(
      {
        roomId: new Types.ObjectId(roomId),
        links: { $elemMatch: { type, targetId } },
      },
      [
        {
          $set: {
            links: {
              $filter: {
                input: '$links',
                as: 'link',
                cond: {
                  $not: {
                    $and: [
                      { $eq: ['$$link.type', type] },
                      { $eq: ['$$link.targetId', targetId] },
                    ],
                  },
                },
              },
            },
            revision: { $add: ['$revision', 1] },
          },
        },
      ],
      session ? { session } : undefined,
    );
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  /**
   * System/auto TODO upsert with dedupe. Does not overwrite user-edited items.
   */
  async ensureAutoTodo(
    roomId: string,
    userId: string,
    opts: {
      title: string;
      description?: string;
      dedupeKey: string;
      kind?: 'duriAnalysis' | 'ocrConfirm' | 'scheduleChange';
      cause?: string;
      baseRevision?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      links?: TodoLinkDto[];
    },
  ) {
    return this.create(
      roomId,
      userId,
      {
        title: opts.title,
        description: opts.description,
        priority: opts.priority ?? 'high',
        links: opts.links,
        source: {
          kind: opts.kind ?? 'scheduleChange',
          dedupeKey: opts.dedupeKey,
          cause: opts.cause,
          baseRevision: opts.baseRevision,
        },
      },
      false,
    );
  }
}

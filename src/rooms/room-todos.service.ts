import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RoomTodo,
  RoomTodoDocument,
  TodoChecklistItem,
  TodoLink,
} from '../schemas/room-todo.schema';
import {
  assertRoomMember,
  assertRoomWritable,
  assertTodoMutator,
  requireRoom,
} from './room-access';
import {
  TravelRoom,
  TravelRoomDocument,
} from '../schemas/travel-room.schema';
import {
  CreateRoomTodoDto,
  ResolveAutoTodosDto,
  TodoChecklistItemDto,
  TodoLinkDto,
  UpdateRoomTodoDto,
} from './dto/room-todo.dto';

@Injectable()
export class RoomTodosService {
  constructor(
    @InjectModel(RoomTodo.name) private todoModel: Model<RoomTodoDocument>,
    @InjectModel(TravelRoom.name) private roomModel: Model<TravelRoomDocument>,
  ) {}

  private async getRoomForMember(roomId: string, userId: string) {
    const room = requireRoom(await this.roomModel.findById(roomId));
    const member = assertRoomMember(room, userId);
    return { room, role: member.role as 'owner' | 'member' };
  }

  private assertAssigneeInRoom(room: TravelRoomDocument, assigneeId?: string | null) {
    if (!assigneeId) return;
    const ok = room.members.some((m) => m.userId.toString() === assigneeId);
    if (!ok) {
      throw new BadRequestException('담당자는 현재 여행방 참여자만 지정할 수 있습니다');
    }
  }

  private assertLinksInRoom(room: TravelRoomDocument, links: TodoLinkDto[]) {
    const itemIds = new Set(
      room.schedule.days.flatMap((d) => d.items.map((i) => i.id)),
    );
    const ticketIds = new Set(
      room.schedule.days.flatMap((d) =>
        d.items.flatMap((i) => (i.tickets ?? []).map((t) => t.id)),
      ),
    );
    const reservationIds = new Set(
      room.schedule.days
        .flatMap((d) => d.items)
        .map((i) => i.reservation?.id)
        .filter(Boolean) as string[],
    );

    for (const link of links) {
      if (link.type === 'scheduleItem' && !itemIds.has(link.targetId)) {
        throw new BadRequestException(
          `일정 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (link.type === 'ticket' && !ticketIds.has(link.targetId)) {
        throw new BadRequestException(
          `티켓 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (link.type === 'reservation' && !reservationIds.has(link.targetId)) {
        throw new BadRequestException(
          `예약 연결 대상이 이 여행방에 없습니다: ${link.targetId}`,
        );
      }
      if (link.type === 'document') {
        // documents store not yet; reject foreign-looking ids silently via allow room-scoped only
        if (!link.targetId.startsWith(room._id.toString()) && !link.scheduleItemId) {
          // allow opaque document ids scoped by FE until doc store lands
        }
      }
      if (link.scheduleItemId && !itemIds.has(link.scheduleItemId)) {
        throw new BadRequestException(
          `scheduleItemId가 이 여행방에 없습니다: ${link.scheduleItemId}`,
        );
      }
    }
  }

  private mapChecklist(items?: TodoChecklistItemDto[]): TodoChecklistItem[] {
    return (items ?? []).map((c, idx) => ({
      id: c.id ?? `chk-${Date.now()}-${idx}`,
      title: c.title,
      done: !!c.done,
      doneAt: c.done ? new Date() : undefined,
    }));
  }

  private mapLinks(links?: TodoLinkDto[]): TodoLink[] {
    return (links ?? []).map((l) => ({
      type: l.type,
      targetId: l.targetId,
      scheduleItemId: l.scheduleItemId,
    }));
  }

  toDto(todo: RoomTodoDocument) {
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
      remindAt: todo.remindAt ?? null,
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
      createdAt: (todo as any).createdAt ?? null,
      updatedAt: (todo as any).updatedAt ?? null,
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
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const filter: Record<string, unknown> = {
      roomId: new Types.ObjectId(roomId),
    };
    if (query.status) filter.status = query.status;
    if (query.assigneeId) filter.assigneeId = new Types.ObjectId(query.assigneeId);
    if (query.dueDate) filter.dueDate = query.dueDate;
    if (query.archived === 'true') filter.archived = true;
    else if (query.archived !== 'all') filter.archived = { $ne: true };

    const [docs, total] = await Promise.all([
      this.todoModel
        .find(filter)
        .sort({ priority: -1, dueDate: 1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.todoModel.countDocuments(filter),
    ]);

    return {
      data: docs.map((t) => this.toDto(t)),
      meta: { total, page, limit },
    };
  }

  async create(roomId: string, userId: string, dto: CreateRoomTodoDto) {
    const { room } = await this.getRoomForMember(roomId, userId);
    assertRoomWritable(room);
    this.assertAssigneeInRoom(room, dto.assigneeId);
    if (dto.links?.length) this.assertLinksInRoom(room, dto.links);

    if (dto.source?.dedupeKey) {
      const existing = await this.todoModel.findOne({
        roomId: room._id,
        'source.dedupeKey': dto.source.dedupeKey,
      });
      if (existing) {
        if (existing.source?.suppressed) {
          return {
            ...this.toDto(existing),
            idempotent: true,
            suppressed: true,
          };
        }
        // atomic upsert-like: return existing without overwriting user edits
        return { ...this.toDto(existing), idempotent: true };
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
        title: dto.title,
        description: dto.description ?? '',
        status: dto.status ?? 'open',
        priority: dto.priority ?? 'medium',
        dueDate: dto.dueDate,
        dueTime: dto.dueTime,
        timezone: dto.timezone ?? room.timezone ?? 'Asia/Seoul',
        assigneeId: dto.assigneeId
          ? new Types.ObjectId(dto.assigneeId)
          : undefined,
        checklist: this.mapChecklist(dto.checklist),
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
        revision: 1,
        lastMutationId: dto.clientMutationId,
      });
      return this.toDto(created);
    } catch (err: any) {
      if (err?.code === 11000 && dto.source?.dedupeKey) {
        const existing = await this.todoModel.findOne({
          roomId: room._id,
          'source.dedupeKey': dto.source.dedupeKey,
        });
        if (existing) return { ...this.toDto(existing), idempotent: true };
      }
      throw err;
    }
  }

  async update(
    roomId: string,
    userId: string,
    todoId: string,
    dto: UpdateRoomTodoDto,
  ) {
    const { room } = await this.getRoomForMember(roomId, userId);
    assertRoomWritable(room);
    const todo = await this.todoModel.findOne({
      _id: todoId,
      roomId: room._id,
    });
    if (!todo) throw new NotFoundException('Todo not found');
    assertTodoMutator(room, userId, todo);

    if (
      dto.clientMutationId &&
      todo.lastMutationId === dto.clientMutationId
    ) {
      return { ...this.toDto(todo), idempotent: true };
    }

    if (dto.expectedRevision !== (todo.revision ?? 1)) {
      throw this.todoConflict(todo, dto.expectedRevision);
    }

    if (dto.assigneeId !== undefined) {
      this.assertAssigneeInRoom(room, dto.assigneeId);
    }
    if (dto.links) this.assertLinksInRoom(room, dto.links);

    const userFieldsTouched =
      dto.title != null ||
      dto.description != null ||
      dto.dueDate !== undefined ||
      dto.dueTime !== undefined ||
      dto.status != null ||
      dto.checklist != null;

    const $set: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(userId),
      revision: (todo.revision ?? 1) + 1,
    };
    if (dto.clientMutationId) $set.lastMutationId = dto.clientMutationId;
    if (dto.title != null) $set.title = dto.title;
    if (dto.description != null) $set.description = dto.description;
    if (dto.status != null) {
      $set.status = dto.status;
      if (dto.status === 'done') {
        $set.completedAt = new Date();
        $set.completedBy = new Types.ObjectId(userId);
      }
    }
    if (dto.priority != null) $set.priority = dto.priority;
    if (dto.dueDate !== undefined) $set.dueDate = dto.dueDate ?? undefined;
    if (dto.dueTime !== undefined) $set.dueTime = dto.dueTime ?? undefined;
    if (dto.timezone != null) $set.timezone = dto.timezone;
    if (dto.assigneeId !== undefined) {
      $set.assigneeId = dto.assigneeId
        ? new Types.ObjectId(dto.assigneeId)
        : null;
    }
    if (dto.checklist) $set.checklist = this.mapChecklist(dto.checklist);
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
      },
      { $set },
      { new: true },
    );

    if (!updated) {
      const latest = await this.todoModel.findById(todoId);
      if (!latest) throw new NotFoundException('Todo not found');
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
    const { room } = await this.getRoomForMember(roomId, userId);
    assertRoomWritable(room);
    const todo = await this.todoModel.findOne({
      _id: todoId,
      roomId: room._id,
    });
    if (!todo) throw new NotFoundException('Todo not found');
    assertTodoMutator(room, userId, todo);
    if (expectedRevision !== (todo.revision ?? 1)) {
      throw this.todoConflict(todo, expectedRevision);
    }

    // Soft-delete for auto todos → suppress recreate; hard delete manual
    if (todo.source?.kind && todo.source.kind !== 'manual') {
      const updated = await this.todoModel.findOneAndUpdate(
        { _id: todo._id, revision: expectedRevision },
        {
          $set: {
            archived: true,
            'source.suppressed': true,
            updatedBy: new Types.ObjectId(userId),
            revision: expectedRevision + 1,
            ...(clientMutationId ? { lastMutationId: clientMutationId } : {}),
          },
        },
        { new: true },
      );
      if (!updated) {
        const latest = await this.todoModel.findById(todoId);
        if (!latest) throw new NotFoundException('Todo not found');
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
      revision: expectedRevision,
    });
    if (!deleted) {
      const latest = await this.todoModel.findById(todoId);
      if (!latest) throw new NotFoundException('Todo not found');
      throw this.todoConflict(latest, expectedRevision);
    }
    return { success: true, deleted: true };
  }

  /**
   * When a cause is resolved, auto-close only non-user-edited todos.
   */
  async resolveAuto(
    roomId: string,
    userId: string,
    dto: ResolveAutoTodosDto,
  ) {
    await this.getRoomForMember(roomId, userId);
    const result = await this.todoModel.updateMany(
      {
        roomId: new Types.ObjectId(roomId),
        'source.dedupeKey': dto.dedupeKey,
        'source.userEdited': { $ne: true },
        'source.suppressed': { $ne: true },
        status: { $nin: ['done', 'cancelled'] },
        archived: { $ne: true },
      },
      {
        $set: {
          status: 'done',
          completedAt: new Date(),
          completedBy: new Types.ObjectId(userId),
          updatedBy: new Types.ObjectId(userId),
        },
        $inc: { revision: 1 },
      },
    );
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
          { links: { $elemMatch: { type: 'scheduleItem', targetId: scheduleItemId } } },
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
    return this.create(roomId, userId, {
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
    });
  }
}

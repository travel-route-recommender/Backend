import { Types } from 'mongoose';
import { TodoChecklistItem } from '../schemas/room-todo.schema';
import { RoomTodosService } from './room-todos.service';

function service() {
  return new RoomTodosService({} as never, {} as never, {} as never);
}

describe('RoomTodosService checklist history', () => {
  it('완료 상태를 유지한 항목은 기존 완료 시각과 완료자를 보존한다', () => {
    const doneAt = new Date('2026-08-19T03:00:00.000Z');
    const doneBy = new Types.ObjectId();
    const previous: TodoChecklistItem[] = [
      { id: 'check-1', title: '이전 제목', done: true, doneAt, doneBy },
    ];
    const instance = service();
    const mapChecklist = (
      instance as unknown as {
        mapChecklist(
          items: Array<{ id: string; title: string; done: boolean }>,
          previous: TodoChecklistItem[],
          actorUserId: string,
        ): TodoChecklistItem[];
      }
    ).mapChecklist.bind(instance);

    const [mapped] = mapChecklist(
      [{ id: 'check-1', title: '수정한 제목', done: true }],
      previous,
      new Types.ObjectId().toString(),
    );

    expect(mapped).toMatchObject({
      id: 'check-1',
      title: '수정한 제목',
      done: true,
      doneAt,
      doneBy,
    });
  });

  it('새로 완료한 항목만 현재 사용자와 완료 시각을 기록하고 해제 시 지운다', () => {
    const actor = new Types.ObjectId();
    const instance = service();
    const mapChecklist = (
      instance as unknown as {
        mapChecklist(
          items: Array<{ id: string; title: string; done: boolean }>,
          previous: TodoChecklistItem[],
          actorUserId: string,
        ): TodoChecklistItem[];
      }
    ).mapChecklist.bind(instance);

    const [completed, reopened] = mapChecklist(
      [
        { id: 'newly-done', title: '완료', done: true },
        { id: 'reopened', title: '다시 열기', done: false },
      ],
      [
        {
          id: 'reopened',
          title: '완료였음',
          done: true,
          doneAt: new Date('2026-08-19T03:00:00.000Z'),
          doneBy: new Types.ObjectId(),
        },
      ],
      actor.toString(),
    );

    expect(completed.doneAt).toBeInstanceOf(Date);
    expect(completed.doneBy?.toString()).toBe(actor.toString());
    expect(reopened).toMatchObject({ done: false });
    expect(reopened.doneAt).toBeUndefined();
    expect(reopened.doneBy).toBeUndefined();
  });
});

describe('RoomTodosService automatic TODO authorization', () => {
  it('일반 멤버의 원인 해소 쓰기 조건에 작성자·담당자 권한을 포함한다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const updateMany = jest.fn().mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
    const instance = new RoomTodosService(
      { updateMany } as never,
      {
        findById: jest.fn().mockResolvedValue({
          _id: roomId,
          members: [{ userId, role: 'member' }],
        }),
      } as never,
      {} as never,
    );

    await instance.resolveAuto(roomId.toString(), userId.toString(), {
      dedupeKey: 'duri:test',
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId,
        'source.dedupeKey': 'duri:test',
        $or: [{ createdBy: userId }, { assigneeId: userId }],
      }),
      expect.any(Object),
    );
  });

  it('자동 TODO 원인이 다시 생기면 완료된 항목을 원자적으로 다시 연다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const todoId = new Types.ObjectId();
    const existing = {
      _id: todoId,
      roomId,
      title: '입장권 확인',
      description: '',
      status: 'done',
      priority: 'high',
      timezone: 'Asia/Seoul',
      checklist: [],
      links: [],
      source: {
        kind: 'scheduleChange',
        dedupeKey: 'scheduleChange:missing-ticket:item-1',
        userEdited: false,
        suppressed: false,
      },
      archived: false,
      createdBy: userId,
      updatedBy: userId,
      completedAt: new Date(),
      completedBy: userId,
      revision: 2,
    };
    const reopened = { ...existing, status: 'open', revision: 3 };
    const findOneAndUpdate = jest.fn().mockResolvedValue(reopened);
    const instance = new RoomTodosService(
      {
        findOne: jest.fn().mockResolvedValue(existing),
        findOneAndUpdate,
      } as never,
      {
        findById: jest.fn().mockResolvedValue({
          _id: roomId,
          timezone: 'Asia/Seoul',
          schedule: { days: [] },
          members: [{ userId, role: 'owner' }],
        }),
      } as never,
      {} as never,
    );

    const result = await instance.ensureAutoTodo(
      roomId.toString(),
      userId.toString(),
      {
        title: '입장권을 다시 확인해 주세요',
        priority: 'high',
        kind: 'scheduleChange',
        dedupeKey: 'scheduleChange:missing-ticket:item-1',
      },
    );

    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      {
        $set: Record<string, unknown>;
        $unset: Record<string, unknown>;
        $inc: Record<string, unknown>;
      },
      Record<string, unknown>,
    ];
    expect(filter).toMatchObject({
      _id: todoId,
      revision: 2,
      'source.userEdited': { $ne: true },
      'source.suppressed': { $ne: true },
    });
    expect(update.$set).toMatchObject({ status: 'open', archived: false });
    expect(update.$unset).toEqual({ completedAt: 1, completedBy: 1 });
    expect(update.$inc).toEqual({ revision: 1 });
    expect(options).toEqual({ returnDocument: 'after' });
    expect(result).toMatchObject({
      status: 'open',
      revision: 3,
      reopened: true,
    });
  });

  it('목록 집계는 urgent부터 명시적으로 정렬하고 같은 snapshot에서 total을 센다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const aggregateExec = jest.fn(
      (): Promise<Array<{ data: never[]; totals: Array<{ value: number }> }>> =>
        Promise.resolve([{ data: [], totals: [{ value: 0 }] }]),
    );
    let receivedPipeline: Array<Record<string, unknown>> = [];
    const aggregate = jest.fn((pipeline: Array<Record<string, unknown>>) => {
      receivedPipeline = pipeline;
      return { exec: aggregateExec };
    });
    const instance = new RoomTodosService(
      { aggregate } as never,
      {
        findById: jest.fn().mockResolvedValue({
          _id: roomId,
          members: [{ userId, role: 'member' }],
        }),
      } as never,
      {} as never,
    );

    await instance.list(roomId.toString(), userId.toString(), {});

    expect(aggregate).toHaveBeenCalledTimes(1);
    const serializedPipeline = JSON.stringify(receivedPipeline);
    expect(serializedPipeline).toContain('"$facet"');
    expect(serializedPipeline).toContain('"totals":[{"$count":"value"}]');
    expect(serializedPipeline).toContain('urgent');
    expect(serializedPipeline).toContain('__priorityRank');
  });
});

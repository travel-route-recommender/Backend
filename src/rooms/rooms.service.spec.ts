import { Types } from 'mongoose';
import { RoomsService } from './rooms.service';

function createService(
  roomModel: Record<string, jest.Mock>,
  dependencies: {
    userModel?: Record<string, jest.Mock>;
    placeModel?: Record<string, jest.Mock>;
    uploads?: Record<string, jest.Mock>;
    todos?: Record<string, jest.Mock>;
    signedUrls?: Record<string, jest.Mock>;
    documents?: Record<string, jest.Mock>;
  } = {},
) {
  return new RoomsService(
    roomModel as never,
    (dependencies.userModel ?? {}) as never,
    (dependencies.placeModel ?? {}) as never,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) } as never,
    {} as never,
    (dependencies.uploads ?? {}) as never,
    (dependencies.todos ?? {}) as never,
    (dependencies.signedUrls ?? {}) as never,
    (dependencies.documents ?? {}) as never,
  );
}

function roomFixture() {
  const userId = new Types.ObjectId();
  const room: {
    _id: Types.ObjectId;
    createdBy: Types.ObjectId;
    members: Array<{ userId: Types.ObjectId; role: 'owner'; joinedAt: Date }>;
    candidatePlaces: unknown[];
    schedule: {
      days: Array<{ day: number; items: Array<Record<string, unknown>> }>;
    };
    scheduleVersion: number;
    factsVersion: number;
    progress: Record<string, unknown>;
    startDate: Date;
    endDate: Date;
  } = {
    _id: new Types.ObjectId(),
    createdBy: userId,
    members: [{ userId, role: 'owner', joinedAt: new Date() }],
    candidatePlaces: [],
    schedule: {
      days: [] as Array<{ day: number; items: Array<Record<string, unknown>> }>,
    },
    scheduleVersion: 2,
    factsVersion: 3,
    progress: {},
    startDate: new Date('2026-08-19T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
  };
  return { room, userId: userId.toString() };
}

describe('RoomsService concurrency and protected dates', () => {
  it('복귀 조건을 지우면 과거 마감시각과 여유시간도 함께 제거한다', async () => {
    const { room, userId } = roomFixture();
    Object.assign(room, {
      returnPoint: { name: '부산역' },
      returnDeadline: { value: '20:00' },
      travelBufferMinutes: { value: 30 },
      prepBufferMinutes: { value: 15 },
      save: jest.fn().mockResolvedValue(undefined),
    });
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn().mockImplementation(
        (
          _filter: unknown,
          update: {
            $set?: Record<string, unknown>;
            $unset?: Record<string, unknown>;
            $inc?: { factsVersion?: number };
          },
        ) => {
          Object.assign(room, update.$set ?? {});
          for (const field of Object.keys(update.$unset ?? {})) {
            delete (room as unknown as Record<string, unknown>)[field];
          }
          room.factsVersion += update.$inc?.factsVersion ?? 0;
          return room;
        },
      ),
    });

    const result = await service.updatePlanning(room._id.toString(), userId, {
      returnPoint: null,
      returnDeadline: null,
      travelBufferMinutes: null,
      prepBufferMinutes: null,
    });

    expect(result).toMatchObject({
      returnPoint: null,
      returnDeadline: null,
      travelBufferMinutes: null,
      prepBufferMinutes: null,
    });
    expect(room).toMatchObject({ factsVersion: 4 });
    expect(
      (room as unknown as Record<string, unknown>).returnDeadline,
    ).toBeUndefined();
  });

  it('batch 저장 재전송에도 프론트가 다시 파싱할 수 있는 전체 일정을 반환한다', async () => {
    const { room, userId } = roomFixture();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'item-1',
            placeName: '부산역',
            startTime: '09:00',
            endTime: '09:30',
            tags: [],
            reason: '',
            priority: 'optional',
            day: 1,
            date: '2026-08-19',
            locked: false,
            tickets: [],
          },
        ],
      },
    ];
    Object.assign(room, {
      scheduleVersion: 3,
      lastScheduleMutationId: 'same-request',
    });
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn(),
    });

    const result = await service.saveSchedule(room._id.toString(), userId, {
      days: [],
      expectedVersion: 2,
      clientMutationId: 'same-request',
    });

    expect(result).toMatchObject({
      idempotent: true,
      scheduleVersion: 3,
      days: [{ day: 1, items: [{ id: 'item-1' }] }],
    });
  });

  it('정상 제안 적용은 잠금·확정 예약·티켓을 그대로 보존한다', async () => {
    const { room, userId } = roomFixture();
    const uploadedBy = new Types.ObjectId();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'protected-item',
            placeName: '예약 장소',
            startTime: '10:00',
            endTime: '11:00',
            tags: ['예약'],
            reason: '확정 예약',
            priority: 'must',
            day: 1,
            date: '2026-08-19',
            locked: true,
            lockedBy: new Types.ObjectId(userId),
            lockedAt: new Date('2026-08-01T00:00:00.000Z'),
            reservation: {
              id: 'reservation-1',
              status: 'confirmed',
              date: '2026-08-19',
              startTime: '10:00',
              documentTicketIds: ['ticket-1'],
              revision: 1,
            },
            tickets: [
              {
                id: 'ticket-1',
                imageUrl: '/uploads/tickets/room/ticket.jpg',
                uploadedBy,
                createdAt: new Date('2026-08-01T00:00:00.000Z'),
              },
            ],
          },
        ],
      },
    ];
    const findOneAndUpdate = jest.fn().mockImplementation(() => room);
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate,
    });

    const result = await service.applyScheduleProposal(
      room._id.toString(),
      userId,
      {
        days: [
          {
            day: 1,
            items: [
              {
                id: 'protected-item',
                placeName: '예약 장소',
                startTime: '10:00',
                endTime: '11:00',
                tags: ['예약'],
                reason: '확정 예약',
                priority: 'must',
                day: 1,
                date: '2026-08-19',
              },
            ],
          },
        ],
        expectedVersion: 2,
        expectedFactsVersion: 3,
      },
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleVersion: 2, factsVersion: 3 }),
      expect.anything(),
      expect.anything(),
    );
    expect(result).toMatchObject({
      scheduleVersion: 3,
      days: [
        {
          items: [
            {
              id: 'protected-item',
              locked: true,
              reservation: { id: 'reservation-1', status: 'confirmed' },
              tickets: [{ id: 'ticket-1' }],
            },
          ],
        },
      ],
    });
  });

  it('제안 생성 뒤 일정 버전만 바뀌면 SCHEDULE_VERSION_CONFLICT 409로 차단한다', async () => {
    const { room, userId } = roomFixture();
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn(),
    });

    await expect(
      service.applyScheduleProposal(room._id.toString(), userId, {
        days: [],
        expectedVersion: 1,
        expectedFactsVersion: 3,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'SCHEDULE_VERSION_CONFLICT' },
    });
  });

  it('제안 생성 뒤 분석 사실 버전만 바뀌면 FACTS_VERSION_CONFLICT 409로 차단한다', async () => {
    const { room, userId } = roomFixture();
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn(),
    });

    await expect(
      service.applyScheduleProposal(room._id.toString(), userId, {
        days: [],
        expectedVersion: 2,
        expectedFactsVersion: 2,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'FACTS_VERSION_CONFLICT' },
    });
  });

  it('Mongo commit 사이 factsVersion이 바뀌면 stale apply를 409로 차단한다', async () => {
    const { room, userId } = roomFixture();
    const findById = jest
      .fn()
      .mockResolvedValueOnce(room)
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          scheduleVersion: 2,
          factsVersion: 4,
        }),
      });
    const service = createService({
      findById,
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    });

    const commit = (
      service as unknown as {
        commitScheduleMutation(
          options: Record<string, unknown>,
        ): Promise<unknown>;
      }
    ).commitScheduleMutation.bind(service);
    await expect(
      commit({
        roomId: room._id.toString(),
        userId,
        expectedVersion: 2,
        expectedFactsVersion: 3,
        mutate: () => ({ result: {} }),
      }),
    ).rejects.toMatchObject({
      response: { code: 'FACTS_VERSION_CONFLICT' },
    });
  });

  it('여행 시작일 이동으로 잠긴 일정의 실제 날짜가 조용히 바뀌는 것을 막는다', async () => {
    const { room, userId } = roomFixture();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'locked-item',
            placeName: '예약 장소',
            startTime: '10:00',
            endTime: '11:00',
            tags: [],
            reason: '',
            priority: 'must',
            day: 1,
            date: '2026-08-19',
            locked: true,
            tickets: [],
          },
        ],
      },
    ];
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn(),
    });

    await expect(
      service.updateTripDates(room._id.toString(), userId, {
        startDate: '2026-08-20',
        endDate: '2026-08-22',
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PROTECTED_DATE_CHANGE_REQUIRES_ACTION',
      },
    });
  });

  it('DB commit 뒤 파일 정리가 실패해도 성공한 일정 변경을 실패로 응답하지 않는다', async () => {
    const { room, userId } = roomFixture();
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate: jest.fn().mockResolvedValue(room),
      },
      {
        uploads: {
          deleteByPublicUrl: jest
            .fn()
            .mockRejectedValue(new Error('filesystem unavailable')),
        },
      },
    );
    (
      service as unknown as {
        logger: { error: jest.Mock };
      }
    ).logger.error = jest.fn();
    const commit = (
      service as unknown as {
        commitScheduleMutation(
          options: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      }
    ).commitScheduleMutation.bind(service);

    await expect(
      commit({
        roomId: room._id.toString(),
        userId,
        expectedVersion: 2,
        mutate: () => ({
          result: { success: true },
          filesToDelete: ['/uploads/tickets/room/old.png'],
        }),
      }),
    ).resolves.toMatchObject({
      result: { success: true },
      scheduleVersion: 3,
    });
  });

  it('동시에 재전송된 같은 mutation은 승리한 결과를 idempotent 성공으로 복구한다', async () => {
    const { room, userId } = roomFixture();
    const latest = {
      ...room,
      scheduleVersion: 3,
      lastScheduleMutationId: 'same-mutation',
    };
    const service = createService({
      findById: jest
        .fn()
        .mockResolvedValueOnce(room)
        .mockResolvedValueOnce(latest),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    });
    const commit = (
      service as unknown as {
        commitScheduleMutation(
          options: Record<string, unknown>,
        ): Promise<Record<string, unknown>>;
      }
    ).commitScheduleMutation.bind(service);

    await expect(
      commit({
        roomId: room._id.toString(),
        userId,
        expectedVersion: 2,
        clientMutationId: 'same-mutation',
        mutate: () => ({ result: { fromLosingRequest: true } }),
      }),
    ).resolves.toMatchObject({
      idempotent: true,
      scheduleVersion: 3,
      room: latest,
    });
  });

  it('일정 삭제 후 파일·TODO 정리 실패가 성공 응답을 뒤집지 않는다', async () => {
    const { room, userId } = roomFixture();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'item-to-delete',
            placeName: '삭제 장소',
            startTime: '10:00',
            endTime: '11:00',
            tags: [],
            reason: '',
            priority: 'optional',
            day: 1,
            locked: false,
            tickets: [
              {
                id: 'ticket-1',
                imageUrl: '/uploads/tickets/room/old.png',
                uploadedBy: new Types.ObjectId(),
                createdAt: new Date(),
              },
            ],
          },
        ],
      },
    ];
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate: jest.fn().mockResolvedValue(room),
      },
      {
        uploads: {
          deleteByPublicUrl: jest
            .fn()
            .mockRejectedValue(new Error('filesystem unavailable')),
        },
        todos: {
          detachScheduleItem: jest
            .fn()
            .mockRejectedValue(new Error('todo unavailable')),
        },
      },
    );
    (
      service as unknown as {
        logger: { error: jest.Mock };
      }
    ).logger.error = jest.fn();

    await expect(
      service.deleteScheduleItem(
        room._id.toString(),
        userId,
        'item-to-delete',
        2,
      ),
    ).resolves.toMatchObject({ success: true, scheduleVersion: 3 });
  });

  it('티켓 삭제 시 예약의 documentTicketIds에서도 같은 ID를 제거한다', async () => {
    const { room, userId } = roomFixture();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'item-1',
            placeName: '예약 장소',
            startTime: '10:00',
            endTime: '11:00',
            tags: [],
            reason: '',
            priority: 'must',
            day: 1,
            locked: false,
            tickets: [
              {
                id: 'ticket-1',
                imageUrl: '/uploads/tickets/room/ticket.png',
                uploadedBy: new Types.ObjectId(),
                createdAt: new Date(),
              },
            ],
            reservation: {
              id: 'reservation-1',
              status: 'confirmed',
              documentTicketIds: ['ticket-1', 'document-1'],
              revision: 1,
            },
          },
        ],
      },
    ];
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate: jest.fn().mockResolvedValue(room),
      },
      {
        uploads: { deleteByPublicUrl: jest.fn().mockResolvedValue(undefined) },
        todos: {
          detachLinkedTarget: jest.fn().mockResolvedValue({}),
          ensureAutoTodo: jest.fn().mockResolvedValue({}),
        },
      },
    );

    await service.deleteScheduleTicket(
      room._id.toString(),
      userId,
      'item-1',
      'ticket-1',
      2,
    );

    const reservation = room.schedule.days[0].items[0].reservation as {
      documentTicketIds: string[];
      revision: number;
    };
    expect(reservation.documentTicketIds).toEqual(['document-1']);
    expect(reservation.revision).toBe(2);
  });

  it('예약 저장 응답 재전송 시 현재 예약을 복구해 동일 계약으로 반환한다', async () => {
    const { room, userId } = roomFixture();
    room.scheduleVersion = 3;
    Object.assign(room, { lastScheduleMutationId: 'reservation-retry' });
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'item-1',
            placeName: '예약 장소',
            startTime: '10:00',
            endTime: '11:00',
            tags: [],
            reason: '',
            priority: 'must',
            day: 1,
            locked: false,
            tickets: [],
            reservation: {
              id: 'reservation-1',
              status: 'confirmed',
              date: '2026-08-19',
              startTime: '10:00',
              endTime: '11:00',
              documentTicketIds: [],
              revision: 1,
            },
          },
        ],
      },
    ];
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate: jest.fn(),
      },
      {
        todos: { resolveAutoSystem: jest.fn().mockResolvedValue({}) },
      },
    );

    await expect(
      service.upsertReservation(room._id.toString(), userId, 'item-1', {
        expectedVersion: 2,
        clientMutationId: 'reservation-retry',
      }),
    ).resolves.toMatchObject({
      reservation: { id: 'reservation-1', status: 'confirmed' },
      scheduleVersion: 3,
    });
  });

  it('batch 요청에서 생략한 기존 메타데이터와 좌표를 지우지 않는다', async () => {
    const { room, userId } = roomFixture();
    room.schedule.days = [
      {
        day: 1,
        items: [
          {
            id: 'item-1',
            placeName: '부산역',
            startTime: '09:00',
            endTime: '10:00',
            tags: ['교통'],
            reason: '첫 도착지',
            priority: 'must',
            day: 1,
            date: '2026-08-19',
            lat: 35.1151,
            lng: 129.0414,
            locked: false,
            tickets: [],
          },
        ],
      },
    ];
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate: jest.fn().mockResolvedValue(room),
    });

    const result = await service.saveSchedule(room._id.toString(), userId, {
      expectedVersion: 2,
      days: [
        {
          day: 1,
          items: [
            {
              id: 'item-1',
              placeName: '부산역',
              startTime: '09:00',
              endTime: '10:00',
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      days: [
        {
          items: [
            {
              tags: ['교통'],
              reason: '첫 도착지',
              priority: 'must',
              lat: 35.1151,
              lng: 129.0414,
            },
          ],
        },
      ],
    });
  });

  it('동시 멤버 의견 충돌 시 최신 후보를 다시 읽어 두 의견을 모두 보존한다', async () => {
    const { room, userId } = roomFixture();
    const placeId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    room.members.push({
      userId: otherUserId,
      role: 'owner',
      joinedAt: new Date(),
    });
    const first = {
      ...room,
      candidatePlaces: [
        { placeId, addedBy: otherUserId, memberSignals: [], scheduled: false },
      ],
    };
    const afterOtherMember = {
      ...room,
      factsVersion: 4,
      candidatePlaces: [
        {
          placeId,
          addedBy: otherUserId,
          scheduled: false,
          memberSignals: [
            {
              userId: otherUserId,
              avoid: true,
              version: 1,
              updatedAt: new Date(),
            },
          ],
        },
      ],
    };
    const persisted = {
      ...afterOtherMember,
      factsVersion: 5,
      candidatePlaces: afterOtherMember.candidatePlaces,
    };
    const findOneAndUpdate = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(
        (
          _filter: unknown,
          update: {
            $set: { candidatePlaces: typeof persisted.candidatePlaces };
          },
        ) => {
          persisted.candidatePlaces = update.$set.candidatePlaces;
          return persisted;
        },
      );
    const service = createService({
      findById: jest
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(afterOtherMember),
      findOneAndUpdate,
    });

    const result = await service.upsertCandidateSignal(
      room._id.toString(),
      userId,
      placeId.toString(),
      { mustVisit: true },
    );

    expect(persisted.candidatePlaces[0].memberSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: otherUserId, avoid: true }),
        expect.objectContaining({
          userId: new Types.ObjectId(userId),
          mustVisit: true,
        }),
      ]),
    );
    expect(result).toMatchObject({
      placeId: placeId.toString(),
      signal: { userId, mustVisit: true },
      factsVersion: 5,
    });
  });

  it('같은 장소를 다시 담을 때 기존 참여자 의견을 새 후보 항목에 상속한다', async () => {
    const { room, userId } = roomFixture();
    const placeId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const existingSignal = {
      userId: otherUserId,
      avoid: true,
      version: 3,
      updatedAt: new Date('2026-08-19T01:00:00.000Z'),
    };
    room.candidatePlaces = [
      {
        placeId,
        addedBy: otherUserId,
        memberSignals: [existingSignal],
        scheduled: false,
      },
    ];
    const findOneAndUpdate = jest.fn(
      (
        _filter: unknown,
        update: { $set: { candidatePlaces: typeof room.candidatePlaces } },
      ) => {
        room.candidatePlaces = update.$set.candidatePlaces;
        room.factsVersion += 1;
        return room;
      },
    );
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate,
      },
      {
        placeModel: {
          findById: jest.fn().mockResolvedValue({ _id: placeId }),
          find: jest.fn().mockResolvedValue([]),
        },
      },
    );

    await service.addCandidate(room._id.toString(), userId, {
      placeId: placeId.toString(),
    });

    const persisted = findOneAndUpdate.mock.calls[0][1].$set
      .candidatePlaces as Array<{
      addedBy: Types.ObjectId;
      memberSignals: Array<Record<string, unknown>>;
    }>;
    expect(persisted).toHaveLength(2);
    expect(persisted[1]).toMatchObject({
      addedBy: new Types.ObjectId(userId),
      memberSignals: [
        expect.objectContaining({
          userId: otherUserId,
          avoid: true,
          version: 3,
        }),
      ],
    });
  });

  it('중복 후보 중 한 구성원의 항목을 지워도 장소 의견을 남은 항목에 보존한다', async () => {
    const { room, userId } = roomFixture();
    const placeId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const userObjectId = new Types.ObjectId(userId);
    room.members.push({
      userId: otherUserId,
      role: 'owner',
      joinedAt: new Date(),
    });
    const userSignal = {
      userId: userObjectId,
      mustVisit: true,
      version: 2,
      updatedAt: new Date('2026-08-19T01:00:00.000Z'),
    };
    const otherSignal = {
      userId: otherUserId,
      preferenceStrength: 5,
      version: 1,
      updatedAt: new Date('2026-08-19T01:01:00.000Z'),
    };
    room.candidatePlaces = [
      {
        placeId,
        addedBy: userObjectId,
        memberSignals: [userSignal],
        scheduled: false,
      },
      {
        placeId,
        addedBy: otherUserId,
        memberSignals: [otherSignal],
        scheduled: false,
      },
    ];
    const findOneAndUpdate = jest.fn(
      (
        _filter: unknown,
        update: { $set: { candidatePlaces: unknown[] }; $inc: unknown },
      ) => ({
        ...room,
        candidatePlaces: update.$set.candidatePlaces,
        factsVersion: room.factsVersion + 1,
      }),
    );
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate,
    });

    await expect(
      service.removeCandidate(room._id.toString(), userId, placeId.toString()),
    ).resolves.toEqual({ success: true, removed: true });

    const persisted = findOneAndUpdate.mock.calls[0][1].$set
      .candidatePlaces as Array<{
      addedBy: Types.ObjectId;
      memberSignals: Array<Record<string, unknown>>;
    }>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ addedBy: otherUserId });
    expect(persisted[0].memberSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: userObjectId, mustVisit: true }),
        expect.objectContaining({
          userId: otherUserId,
          preferenceStrength: 5,
        }),
      ]),
    );
  });

  it('같은 장소가 여러 번 담겨도 새 의견을 모든 후보 항목에 동기화한다', async () => {
    const { room, userId } = roomFixture();
    const placeId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    room.members.push({
      userId: otherUserId,
      role: 'owner',
      joinedAt: new Date(),
    });
    room.candidatePlaces = [
      {
        placeId,
        addedBy: new Types.ObjectId(userId),
        memberSignals: [],
        scheduled: false,
      },
      {
        placeId,
        addedBy: otherUserId,
        memberSignals: [],
        scheduled: false,
      },
    ];
    const findOneAndUpdate = jest.fn(
      (
        _filter: unknown,
        update: { $set: { candidatePlaces: typeof room.candidatePlaces } },
      ) => ({
        ...room,
        candidatePlaces: update.$set.candidatePlaces,
        factsVersion: room.factsVersion + 1,
      }),
    );
    const service = createService({
      findById: jest.fn().mockResolvedValue(room),
      findOneAndUpdate,
    });

    await service.upsertCandidateSignal(
      room._id.toString(),
      userId,
      placeId.toString(),
      { preferenceStrength: 4 },
    );

    const persisted = findOneAndUpdate.mock.calls[0][1].$set
      .candidatePlaces as Array<{
      memberSignals: Array<Record<string, unknown>>;
    }>;
    expect(persisted).toHaveLength(2);
    for (const candidate of persisted) {
      expect(candidate.memberSignals).toEqual([
        expect.objectContaining({
          userId: new Types.ObjectId(userId),
          preferenceStrength: 4,
          version: 1,
        }),
      ]);
    }
  });

  it('레거시 성향 필드를 각각 조건부 보정해 동시 설문 결과를 덮어쓰지 않는다', async () => {
    const { room, userId } = roomFixture();
    const user = {
      _id: new Types.ObjectId(userId),
      nickname: '여행자',
      travelType: { name: '탐험형', tags: ['로컬'], emoji: '🧭' },
      personalityAxes: {
        scheduleDensity: 60,
        landmarkNecessity: 40,
        localInterest: 80,
        challenging: 50,
      },
      interestTags: ['시장', '산책'],
      mobilityConstraints: ['계단 회피'],
      onboardingCompleted: true,
    };
    const updateOne = jest.fn(
      (
        _filter: Record<string, unknown>,
        _update: { $set: Record<string, unknown> },
      ) => {
        void _filter;
        void _update;
        return Promise.resolve({ modifiedCount: 0 });
      },
    );
    const service = createService(
      {
        findById: jest.fn().mockResolvedValue(room),
        updateOne,
      },
      { userModel: { find: jest.fn().mockResolvedValue([user]) } },
    );

    await service.getMemberPreferences(room._id.toString(), userId);

    expect(updateOne).toHaveBeenCalledTimes(4);
    const updates = updateOne.mock.calls.map(([, update]) => update.$set);
    expect(
      updates.find((update) => 'members.$.interestTagsSnapshot' in update)?.[
        'members.$.interestTagsSnapshot'
      ],
    ).toEqual(['시장', '산책']);
    expect(
      updates.find((update) => 'members.$.travelTypeSnapshot' in update)?.[
        'members.$.travelTypeSnapshot'
      ],
    ).toBe(user.travelType);
    expect(
      updates.find((update) => 'members.$.personalityAxesSnapshot' in update)?.[
        'members.$.personalityAxesSnapshot'
      ],
    ).toBe(user.personalityAxes);
    expect(
      updates.some((update) => 'members.$.mobilityConstraints' in update),
    ).toBe(true);
    expect(
      updates.every(
        (update) =>
          Object.keys(update).filter(
            (key) =>
              key.includes('Snapshot') || key.includes('mobilityConstraints'),
          ).length === 1,
      ),
    ).toBe(true);
  });
});

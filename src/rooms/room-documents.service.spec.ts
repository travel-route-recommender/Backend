import { Types } from 'mongoose';
import { RoomDocumentsService } from './room-documents.service';

describe('RoomDocumentsService reservation links', () => {
  it('문서 삭제와 함께 예약 참조를 조건부 제거하고 일정 버전을 올린다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const documentId = new Types.ObjectId().toString();
    const room = {
      _id: roomId,
      createdBy: userId,
      members: [{ userId, role: 'owner' }],
      scheduleVersion: 4,
      factsVersion: 2,
      schedule: {
        days: [
          {
            day: 1,
            items: [
              {
                reservation: { documentTicketIds: [documentId, 'ticket-1'] },
              },
            ],
          },
        ],
      },
      markModified: jest.fn(),
    };
    const deleteOne = jest.fn().mockResolvedValue(undefined);
    const document = {
      _id: new Types.ObjectId(documentId),
      roomId,
      fileUrl: `/uploads/documents/${roomId.toString()}/file.pdf`,
      uploadedBy: userId,
      deleteOne,
    };
    const tombstonedDocument = { ...document, deletingAt: new Date() };
    const findOneAndUpdate = jest.fn(
      (
        _filter: unknown,
        update: {
          $push?: Record<string, unknown>;
          $inc?: { factsVersion?: number; scheduleVersion?: number };
        },
      ) => {
        room.factsVersion += update.$inc?.factsVersion ?? 0;
        room.scheduleVersion += update.$inc?.scheduleVersion ?? 0;
        if (update.$push) {
          Object.assign(room, {
            documentMutationReceipts: [
              {
                id: `delete:${documentId}`,
                kind: 'delete',
                appliedAt: new Date(),
              },
            ],
          });
        }
        return room;
      },
    );
    const service = new RoomDocumentsService(
      {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(document)
          .mockResolvedValueOnce(tombstonedDocument),
        findOneAndUpdate: jest.fn().mockResolvedValue(tombstonedDocument),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as never,
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate,
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as never,
      { deleteByPublicUrl: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {
        detachLinkedTarget: jest.fn().mockResolvedValue({ modified: 1 }),
      } as never,
      {
        startSession: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Transaction numbers are only allowed on a replica set member or mongos',
            ),
          ),
      } as never,
      { get: jest.fn().mockReturnValue('development') } as never,
    );

    const result = await service.remove(
      roomId.toString(),
      userId.toString(),
      documentId,
    );

    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        _id: roomId,
        scheduleVersion: 4,
        factsVersion: 3,
      },
      {
        $set: { schedule: room.schedule },
        $inc: { scheduleVersion: 1 },
      },
      { returnDocument: 'after' },
    );
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      scheduleVersion: 5,
      factsVersion: 3,
    });
  });

  it('standalone facts 영수증 재시도는 버전을 두 번 올리지 않는다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const documentId = new Types.ObjectId().toString();
    const receiptId = `delete:${documentId}`;
    const room = {
      _id: roomId,
      createdBy: userId,
      members: [{ userId, role: 'owner' }],
      scheduleVersion: 0,
      factsVersion: 3,
      documentMutationReceipts: [
        { id: receiptId, kind: 'delete', appliedAt: new Date() },
      ],
    };
    const findOneAndUpdate = jest
      .fn()
      .mockResolvedValueOnce(room)
      .mockResolvedValueOnce(null);
    const service = new RoomDocumentsService(
      {} as never,
      {
        findById: jest.fn().mockResolvedValue(room),
        findOneAndUpdate,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue('development') } as never,
    );
    const applyReceipt = (
      service as unknown as {
        applyStandaloneFactsReceipt(
          requestedRoomId: string,
          requestedUserId: string,
          kind: 'upload' | 'delete',
          requestedDocumentId: string,
        ): Promise<{ factsVersion: number }>;
      }
    ).applyStandaloneFactsReceipt.bind(service);

    const first = await applyReceipt(
      roomId.toString(),
      userId.toString(),
      'delete',
      documentId,
    );
    const retry = await applyReceipt(
      roomId.toString(),
      userId.toString(),
      'delete',
      documentId,
    );

    expect(first.factsVersion).toBe(3);
    expect(retry.factsVersion).toBe(3);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        'documentMutationReceipts.id': { $ne: receiptId },
      }),
      expect.any(Object),
      { returnDocument: 'after' },
    );
  });

  it('영수증 정리 실패는 이미 완료된 변경을 실패 응답으로 바꾸지 않는다', async () => {
    const loggerRoomId = new Types.ObjectId();
    const documentId = new Types.ObjectId().toString();
    const service = new RoomDocumentsService(
      {} as never,
      {
        updateOne: jest.fn().mockRejectedValue(new Error('temporary cleanup')),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const clearReceipt = (
      service as unknown as {
        clearStandaloneReceipt(
          requestedRoomId: string,
          kind: 'upload' | 'delete',
          requestedDocumentId: string,
        ): Promise<void>;
      }
    ).clearStandaloneReceipt.bind(service);

    await expect(
      clearReceipt(loggerRoomId.toString(), 'upload', documentId),
    ).resolves.toBeUndefined();
  });

  it('운영 트랜잭션에서 문서·예약·TODO 연결과 버전을 함께 반영한다', async () => {
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const documentId = new Types.ObjectId().toString();
    const reservation = {
      documentTicketIds: [documentId, 'ticket-1'],
      revision: 2,
    };
    const room = {
      _id: roomId,
      createdBy: userId,
      members: [{ userId, role: 'owner' }],
      scheduleVersion: 4,
      factsVersion: 2,
      schedule: {
        days: [{ day: 1, items: [{ id: 'item-1', reservation }] }],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const document = {
      _id: new Types.ObjectId(documentId),
      roomId,
      fileUrl: `/uploads/documents/${roomId.toString()}/file.pdf`,
      uploadedBy: userId,
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    const session = {
      withTransaction: jest.fn(async (task: () => Promise<unknown>) => task()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const query = (value: unknown) => ({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });
    const detachLinkedTarget = jest.fn().mockResolvedValue({ modified: 1 });
    const service = new RoomDocumentsService(
      {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(document)
          .mockReturnValueOnce(query(document)),
        findOneAndUpdate: jest.fn().mockResolvedValue({
          ...document,
          deletingAt: new Date(),
        }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      } as never,
      {
        findById: jest
          .fn()
          .mockResolvedValueOnce(room)
          .mockReturnValueOnce(query(room)),
      } as never,
      { deleteByPublicUrl: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      { detachLinkedTarget } as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      { get: jest.fn().mockReturnValue('production') } as never,
    );

    await expect(
      service.remove(roomId.toString(), userId.toString(), documentId),
    ).resolves.toMatchObject({ scheduleVersion: 5, factsVersion: 3 });
    expect(reservation).toMatchObject({
      documentTicketIds: ['ticket-1'],
      revision: 3,
    });
    expect(room.save).toHaveBeenCalledWith({ session });
    expect(document.deleteOne).toHaveBeenCalledWith({ session });
    expect(detachLinkedTarget).toHaveBeenCalledWith(
      roomId.toString(),
      'document',
      documentId,
      session,
    );
  });
});

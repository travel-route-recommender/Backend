import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { AccountDeletionService } from './account-deletion.service';

function resolved<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function modelWithDeleteMany() {
  return { deleteMany: jest.fn(() => resolved({ deletedCount: 1 })) };
}

describe('AccountDeletionService', () => {
  it('rejects an email account when the current password is missing', async () => {
    const user = {
      _id: new Types.ObjectId(),
      passwordHash: await bcrypt.hash('correct-password', 4),
    };
    const userModel = {
      findById: jest.fn(() => resolved(user)),
      deleteOne: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const service = new AccountDeletionService(
      userModel as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      {
        find: jest.fn(() => resolved([])),
        deleteMany: jest.fn(() => resolved({ deletedCount: 0 })),
      } as never,
      { find: jest.fn(() => resolved([])), deleteMany: jest.fn() } as never,
      { find: jest.fn(() => resolved([])), deleteMany: jest.fn() } as never,
      modelWithDeleteMany() as never,
      { deleteByPublicUrl: jest.fn() } as never,
    );

    await expect(
      service.deleteAccount(user._id.toString()),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(userModel.deleteOne).not.toHaveBeenCalled();
  });

  it('removes personal records and scrubs user references from another owner shared room', async () => {
    const target = new Types.ObjectId();
    const remaining = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const room = {
      _id: roomId,
      createdBy: remaining,
      members: [
        { userId: remaining, role: 'owner', joinedAt: new Date('2026-01-01') },
        { userId: target, role: 'member', joinedAt: new Date('2026-01-02') },
      ],
      transportMode: { value: 'car', updatedBy: target },
      returnDeadline: undefined,
      travelBufferMinutes: undefined,
      prepBufferMinutes: undefined,
      candidatePlaces: [
        { addedBy: target, memberSignals: [] },
        {
          addedBy: remaining,
          memberSignals: [{ userId: target }, { userId: remaining }],
        },
      ],
      schedule: {
        days: [
          {
            items: [
              {
                locked: true,
                lockedBy: target,
                lockedAt: new Date(),
                tickets: [
                  { uploadedBy: target, imageUrl: '/uploads/tickets/user.jpg' },
                  {
                    uploadedBy: remaining,
                    imageUrl: '/uploads/tickets/other.jpg',
                  },
                ],
                reservation: { confirmedBy: target, confirmedAt: new Date() },
              },
            ],
          },
        ],
      },
      factsVersion: 2,
      scheduleVersion: 3,
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const todo = {
      roomId,
      createdBy: remaining,
      updatedBy: target,
      completedBy: target,
      assigneeId: target,
      checklist: [{ doneBy: target }],
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    const userModel = {
      findById: jest.fn(() =>
        resolved({
          _id: target,
          passwordHash: undefined,
          profileImageUrl: '/uploads/profiles/me.jpg',
        }),
      ),
      deleteOne: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const roomModel = {
      find: jest.fn(() => resolved([room])),
      deleteMany: jest.fn(() => resolved({ deletedCount: 0 })),
    };
    const todoModel = {
      find: jest.fn(() => resolved([todo])),
      deleteMany: jest.fn(() => resolved({ deletedCount: 0 })),
    };
    const documentModel = {
      find: jest.fn(() =>
        resolved([{ fileUrl: '/uploads/documents/user.pdf' }]),
      ),
      deleteMany: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const uploads = {
      deleteByPublicUrl: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountDeletionService(
      userModel as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      roomModel as never,
      todoModel as never,
      documentModel as never,
      modelWithDeleteMany() as never,
      uploads as never,
    );

    await expect(service.deleteAccount(target.toString())).resolves.toEqual({
      success: true,
    });

    expect(room.createdBy.equals(remaining)).toBe(true);
    expect(room.members).toHaveLength(1);
    expect(room.members[0]?.role).toBe('owner');
    expect(room.transportMode.updatedBy.equals(remaining)).toBe(true);
    expect(room.candidatePlaces).toHaveLength(1);
    expect(room.candidatePlaces[0]?.memberSignals).toHaveLength(1);
    const item = room.schedule.days[0]?.items[0];
    expect(item?.locked).toBe(false);
    expect(item?.lockedBy).toBeUndefined();
    expect(item?.tickets).toHaveLength(1);
    expect(item?.reservation.confirmedBy).toBeUndefined();
    expect(todo.createdBy.equals(remaining)).toBe(true);
    expect(todo.assigneeId).toBeUndefined();
    expect(todo.checklist[0]?.doneBy).toBeUndefined();
    expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: target });
    expect(uploads.deleteByPublicUrl).toHaveBeenCalledTimes(3);
  });

  it('deletes a room created by the user even when other members remain', async () => {
    const target = new Types.ObjectId();
    const remaining = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const roomModel = {
      find: jest.fn(() =>
        resolved([
          {
            _id: roomId,
            createdBy: target,
            members: [
              { userId: target, role: 'owner', joinedAt: new Date() },
              { userId: remaining, role: 'member', joinedAt: new Date() },
            ],
            schedule: { days: [] },
          },
        ]),
      ),
      deleteMany: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const todoModel = {
      find: jest.fn(() => resolved([])),
      deleteMany: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const reportModel = modelWithDeleteMany();
    const service = new AccountDeletionService(
      {
        findById: jest.fn(() => resolved({ _id: target })),
        deleteOne: jest.fn(() => resolved({ deletedCount: 1 })),
      } as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      roomModel as never,
      todoModel as never,
      {
        find: jest.fn(() => resolved([])),
        deleteMany: jest.fn(() => resolved({ deletedCount: 0 })),
      } as never,
      reportModel as never,
      { deleteByPublicUrl: jest.fn() } as never,
    );

    await service.deleteAccount(target.toString());

    expect(roomModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [roomId] },
    });
    expect(todoModel.deleteMany).toHaveBeenCalled();
    expect(reportModel.deleteMany).toHaveBeenCalled();
  });

  it('keeps the user record when an uploaded file cannot be deleted', async () => {
    const target = new Types.ObjectId();
    const userModel = {
      findById: jest.fn(() =>
        resolved({
          _id: target,
          profileImageUrl: '/uploads/profiles/me.jpg',
        }),
      ),
      deleteOne: jest.fn(() => resolved({ deletedCount: 1 })),
    };
    const service = new AccountDeletionService(
      userModel as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      modelWithDeleteMany() as never,
      { find: jest.fn(() => resolved([])), deleteMany: jest.fn() } as never,
      { find: jest.fn(() => resolved([])), deleteMany: jest.fn() } as never,
      {
        find: jest.fn(() => resolved([])),
        deleteMany: jest.fn(() => resolved({ deletedCount: 0 })),
      } as never,
      modelWithDeleteMany() as never,
      {
        deleteByPublicUrl: jest
          .fn()
          .mockRejectedValue(new Error('storage unavailable')),
      } as never,
    );

    await expect(service.deleteAccount(target.toString())).rejects.toThrow(
      'storage unavailable',
    );
    expect(userModel.deleteOne).not.toHaveBeenCalled();
  });
});

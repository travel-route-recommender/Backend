import { ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

function objectIdLike(value: string) {
  return { toString: () => value };
}

describe('RoomsService room settings authorization', () => {
  const createService = (room: Record<string, unknown>) =>
    new RoomsService(
      { findById: jest.fn().mockResolvedValue(room) } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
    );

  const createRoom = () => ({
    title: 'Original title',
    members: [
      { userId: objectIdLike('owner-id'), role: 'owner' },
      { userId: objectIdLike('guest-id'), role: 'member' },
    ],
    candidatePlaces: [],
    schedule: { days: [] },
    destination: undefined,
    startDate: undefined,
    endDate: undefined,
    status: 'ongoing',
    save: jest.fn().mockResolvedValue(undefined),
    _id: objectIdLike('room-id'),
    createdBy: objectIdLike('owner-id'),
    inviteCode: 'INVITE01',
    inviteLink: 'tripmatch://invite/INVITE01',
  });

  it('rejects room title or status updates from non-owner members', async () => {
    const room = createRoom();
    const service = createService(room);

    await expect(
      service.updateRoom('room-id', 'guest-id', {
        title: 'Hijacked title',
        status: 'completed',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(room.save).not.toHaveBeenCalled();
    expect(room.title).toBe('Original title');
    expect(room.status).toBe('ongoing');
  });

  it('allows room settings updates from the owner', async () => {
    const room = createRoom();
    const service = createService(room);

    await expect(
      service.updateRoom('room-id', 'owner-id', {
        title: 'Owner title',
        status: 'completed',
      }),
    ).resolves.toMatchObject({
      id: 'room-id',
      title: 'Owner title',
      status: 'completed',
    });
    expect(room.save).toHaveBeenCalledTimes(1);
  });
});

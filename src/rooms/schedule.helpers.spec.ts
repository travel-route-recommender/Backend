import { Types } from 'mongoose';
import { ItineraryItem } from '../schemas/travel-room.schema';
import {
  findProtectedProposalConflicts,
  ticketsForPlaceChange,
} from './schedule.helpers';

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: 'fixed',
    placeName: '예약 장소',
    startTime: '10:00',
    endTime: '11:00',
    tags: [],
    reason: '',
    priority: 'must',
    day: 1,
    locked: false,
    tickets: [],
    ...overrides,
  };
}

describe('schedule helpers', () => {
  it('장소가 바뀌면 티켓을 승계하지 않는다', () => {
    const before = new Types.ObjectId();
    const result = ticketsForPlaceChange(
      item({
        placeId: before,
        tickets: [
          {
            id: 'ticket-1',
            imageUrl: '/uploads/tickets/room/a.jpg',
            uploadedBy: new Types.ObjectId(),
            createdAt: new Date(),
          },
        ],
      }),
      new Types.ObjectId(),
    );
    expect(result.tickets).toEqual([]);
    expect(result.filesToDelete).toEqual(['/uploads/tickets/room/a.jpg']);
  });

  it.each([
    ['locked', item({ locked: true })],
    [
      'reservation',
      item({
        reservation: {
          id: 'reservation-1',
          status: 'confirmed',
          documentTicketIds: [],
          revision: 1,
        },
      }),
    ],
    [
      'ticket',
      item({
        tickets: [
          {
            id: 'ticket-1',
            imageUrl: '/uploads/tickets/room/a.jpg',
            uploadedBy: new Types.ObjectId(),
            createdAt: new Date(),
          },
        ],
      }),
    ],
  ] as const)('%s 일정의 제안 이동을 차단한다', (reason, current) => {
    expect(
      findProtectedProposalConflicts(
        [{ day: 1, items: [current] }],
        [
          {
            day: 1,
            items: [
              {
                id: current.id,
                placeName: current.placeName,
                startTime: '11:00',
                endTime: '12:00',
              },
            ],
          },
        ],
      ),
    ).toEqual([{ itemId: current.id, reason }]);
  });

  it('제안 적용이 일정 내용은 그대로 둔 채 잠금만 해제하는 것도 차단한다', () => {
    const current = item({ locked: true });

    expect(
      findProtectedProposalConflicts(
        [{ day: 1, items: [current] }],
        [
          {
            day: 1,
            items: [
              {
                id: current.id,
                placeName: current.placeName,
                startTime: current.startTime,
                endTime: current.endTime,
                locked: false,
              },
            ],
          },
        ],
      ),
    ).toEqual([{ itemId: current.id, reason: 'locked' }]);
  });

  it.each([
    ['locked', item({ locked: true })],
    [
      'reservation',
      item({
        reservation: {
          id: 'reservation-1',
          status: 'confirmed',
          documentTicketIds: [],
          revision: 1,
        },
      }),
    ],
    [
      'ticket',
      item({
        tickets: [
          {
            id: 'ticket-1',
            imageUrl: '/uploads/tickets/room/a.jpg',
            uploadedBy: new Types.ObjectId(),
            createdAt: new Date(),
          },
        ],
      }),
    ],
  ] as const)('%s 일정이 동일하면 제안 적용을 허용한다', (_reason, current) => {
    expect(
      findProtectedProposalConflicts(
        [{ day: 1, items: [current] }],
        [
          {
            day: 1,
            items: [
              {
                id: current.id,
                placeName: current.placeName,
                startTime: current.startTime,
                endTime: current.endTime,
              },
            ],
          },
        ],
      ),
    ).toEqual([]);
  });
});

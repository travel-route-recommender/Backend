import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TravelRoomDocument } from '../schemas/travel-room.schema';

export type RoomRole = 'owner' | 'member';

export function findRoomMember(room: TravelRoomDocument, userId: string) {
  return room.members.find((m) => m.userId.toString() === userId);
}

export function assertRoomMember(room: TravelRoomDocument, userId: string) {
  const member = findRoomMember(room, userId);
  if (!member) throw new ForbiddenException('Not a room member');
  return member;
}

export function assertRoomOwner(room: TravelRoomDocument, userId: string) {
  const member = assertRoomMember(room, userId);
  if (member.role !== 'owner') {
    throw new ForbiddenException({
      code: 'OWNER_REQUIRED',
      message: '방장만 할 수 있는 작업입니다.',
    });
  }
  return member;
}

export function assertTodoMutator(
  room: TravelRoomDocument,
  userId: string,
  todo: {
    createdBy?: { toString(): string };
    assigneeId?: { toString(): string } | null;
  },
) {
  const member = assertRoomMember(room, userId);
  if (member.role === 'owner') return member;
  const isCreator = todo.createdBy?.toString() === userId;
  const isAssignee = todo.assigneeId?.toString() === userId;
  if (!isCreator && !isAssignee) {
    throw new ForbiddenException({
      code: 'TODO_MUTATION_FORBIDDEN',
      message: '본인이 만든 TODO이거나 담당자·방장만 수정/삭제할 수 있습니다.',
    });
  }
  return member;
}

export function requireRoom(
  room: TravelRoomDocument | null,
): TravelRoomDocument {
  if (!room) throw new NotFoundException('Room not found');
  return room;
}

export function assertRoomWritable(room: TravelRoomDocument) {
  if (room.status === 'closed') {
    throw new ForbiddenException({
      code: 'ROOM_CLOSED',
      message: '방장이 탈퇴하여 닫힌 여행방입니다.',
    });
  }
}

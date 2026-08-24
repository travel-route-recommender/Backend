/**
 * Schedule mutation helpers: version conflict, lock checks, place-change ticket clear.
 */
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ConfirmedReservation,
  ItineraryItem,
  PlaceAnchor,
  ScheduleTicket,
  TravelRoomDocument,
  VersionedValue,
} from '../schemas/travel-room.schema';

export function scheduleConflict(currentVersion: number, expectedVersion?: number) {
  return new ConflictException({
    code: 'SCHEDULE_VERSION_CONFLICT',
    message:
      '일정이 다른 멤버에 의해 먼저 수정되었습니다. 최신 일정을 다시 불러온 뒤 저장하세요.',
    currentVersion,
    expectedVersion,
  });
}

export function assertNotLocked(
  item: ItineraryItem,
  opts?: { unlock?: boolean },
) {
  if (item.locked && !opts?.unlock) {
    throw new ForbiddenException({
      code: 'SCHEDULE_ITEM_LOCKED',
      message:
        '잠긴 일정은 이동·수정·삭제할 수 없습니다. unlock=true로 잠금 해제 후 변경하세요.',
      itemId: item.id,
    });
  }
}

export function placeIdChanged(
  previous?: Types.ObjectId,
  next?: Types.ObjectId | null,
): boolean {
  const a = previous?.toString() ?? null;
  const b = next == null ? null : next.toString();
  return a !== b;
}

/** place 변경 시 이전 티켓은 승계하지 않음 */
export function ticketsForPlaceChange(
  previous: ItineraryItem | undefined,
  nextPlaceId?: Types.ObjectId,
): { tickets: ScheduleTicket[]; filesToDelete: string[] } {
  if (!previous) return { tickets: [], filesToDelete: [] };
  if (!placeIdChanged(previous.placeId, nextPlaceId)) {
    return {
      tickets: previous.tickets ?? [],
      filesToDelete: [],
    };
  }
  const old = previous.tickets ?? [];
  return {
    tickets: [],
    filesToDelete: old.map((t) => t.imageUrl),
  };
}

export function toVersionedDto(v?: VersionedValue) {
  if (!v) return null;
  return {
    value: v.value,
    updatedBy: v.updatedBy.toString(),
    updatedAt: v.updatedAt,
    confirmedAt: v.confirmedAt ?? null,
    version: v.version ?? 1,
  };
}

export function setVersionedValue(
  previous: VersionedValue | undefined,
  value: unknown,
  userId: string,
  confirm?: boolean,
): VersionedValue {
  const now = new Date();
  return {
    value,
    updatedBy: new Types.ObjectId(userId),
    updatedAt: now,
    confirmedAt: confirm ? now : previous?.confirmedAt,
    version: (previous?.version ?? 0) + 1,
  };
}

export function toAnchorDto(a?: PlaceAnchor) {
  if (!a) return null;
  return {
    name: a.name,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    placeId: a.placeId?.toString() ?? null,
    externalId: a.externalId ?? null,
    source: a.source ?? null,
  };
}

export function fromAnchorDto(
  dto:
    | {
        name: string;
        lat?: number;
        lng?: number;
        placeId?: string;
        externalId?: string;
        source?: 'tour' | 'kakao' | 'manual';
      }
    | null
    | undefined,
): PlaceAnchor | undefined {
  if (dto == null) return undefined;
  return {
    name: dto.name,
    lat: dto.lat,
    lng: dto.lng,
    placeId: dto.placeId ? new Types.ObjectId(dto.placeId) : undefined,
    externalId: dto.externalId,
    source: dto.source,
  };
}

export function toReservationDto(r?: ConfirmedReservation) {
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    date: r.date ?? null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    timeWindowStart: r.timeWindowStart ?? null,
    timeWindowEnd: r.timeWindowEnd ?? null,
    timezone: r.timezone ?? null,
    placeId: r.placeId?.toString() ?? null,
    externalId: r.externalId ?? null,
    confirmationCode: r.confirmationCode ?? null,
    note: r.note ?? null,
    documentTicketIds: r.documentTicketIds ?? [],
    confirmedBy: r.confirmedBy?.toString() ?? null,
    confirmedAt: r.confirmedAt ?? null,
    revision: r.revision ?? 1,
  };
}

export function serializeScheduleItem(item: ItineraryItem) {
  return {
    id: item.id,
    placeId: item.placeId?.toString() ?? null,
    placeName: item.placeName,
    startTime: item.startTime,
    endTime: item.endTime,
    tags: item.tags ?? [],
    reason: item.reason ?? '',
    priority: item.priority,
    day: item.day,
    date: item.date ?? null,
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    locked: !!item.locked,
    lockedBy: item.lockedBy?.toString() ?? null,
    lockedAt: item.lockedAt ?? null,
    tickets: (item.tickets ?? []).map((t) => ({
      id: t.id,
      imageUrl: t.imageUrl,
      uploadedBy: t.uploadedBy.toString(),
      note: t.note,
      originalName: t.originalName,
      mimeType: t.mimeType,
      createdAt: t.createdAt,
    })),
    reservation: toReservationDto(item.reservation),
  };
}

export function planningSnapshot(room: TravelRoomDocument) {
  return {
    timezone: room.timezone ?? 'Asia/Seoul',
    lodging: toAnchorDto(room.lodging),
    returnPoint: toAnchorDto(room.returnPoint),
    transportMode: toVersionedDto(room.transportMode),
    returnDeadline: toVersionedDto(room.returnDeadline),
    travelBufferMinutes: toVersionedDto(room.travelBufferMinutes),
    prepBufferMinutes: toVersionedDto(room.prepBufferMinutes),
  };
}

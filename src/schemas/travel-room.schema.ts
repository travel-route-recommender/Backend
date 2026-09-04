import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TravelType } from './user.schema';

export type TravelRoomDocument = HydratedDocument<TravelRoom>;

@Schema({ _id: false })
export class RoomDestination {
  @Prop({ required: true })
  name: string;

  @Prop()
  regionCode?: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
}

/** 숙소·복귀 지점 등 좌표+외부 ID 앵커 */
@Schema({ _id: false })
export class PlaceAnchor {
  @Prop({ required: true })
  name: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ type: Types.ObjectId, ref: 'Place' })
  placeId?: Types.ObjectId;

  @Prop()
  externalId?: string;

  @Prop({ enum: ['tour', 'kakao', 'manual'] })
  source?: 'tour' | 'kakao' | 'manual';
}

/** 수정자·확인·버전이 있는 계획 설정 값 */
@Schema({ _id: false })
export class VersionedValue {
  @Prop({ type: Object, required: true })
  value: unknown;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  updatedAt: Date;

  @Prop()
  confirmedAt?: Date;

  @Prop({ default: 1 })
  version: number;
}

@Schema({ _id: false })
export class MemberConstraintSnapshot {
  @Prop({ type: [String], default: [] })
  values: string[];

  @Prop({ enum: ['present', 'missing', 'stale'], default: 'missing' })
  status: 'present' | 'missing' | 'stale';

  @Prop({ enum: ['onboarding', 'quiz', 'manual', 'user'], default: 'user' })
  source: string;

  @Prop({ default: 1 })
  version: number;

  @Prop()
  updatedAt?: Date;
}

@Schema({ _id: false })
export class RoomMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['owner', 'member'], default: 'member' })
  role: 'owner' | 'member';

  @Prop({ default: () => new Date() })
  joinedAt: Date;

  @Prop({ type: TravelType })
  travelTypeSnapshot?: TravelType;

  @Prop({ type: Object })
  personalityAxesSnapshot?: {
    scheduleDensity: number;
    landmarkNecessity: number;
    localInterest: number;
    challenging: number;
  };

  @Prop({ type: [String], default: undefined })
  interestTagsSnapshot?: string[];

  @Prop({ type: MemberConstraintSnapshot })
  mobilityConstraints?: MemberConstraintSnapshot;

  @Prop()
  preferenceUpdatedAt?: Date;
}

@Schema({ _id: false })
export class CandidateMemberSignal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  mustVisit?: boolean;

  @Prop()
  avoid?: boolean;

  /** 1–5 preference strength; absent = unanswered (never coerce to 0) */
  @Prop()
  preferenceStrength?: number;

  @Prop({ default: 1 })
  version: number;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

@Schema({ _id: false })
export class CandidatePlace {
  @Prop({ type: Types.ObjectId, ref: 'Place', required: true })
  placeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  addedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  addedAt: Date;

  @Prop()
  note?: string;

  @Prop({ default: false })
  scheduled: boolean;

  @Prop({ type: [CandidateMemberSignal], default: [] })
  memberSignals: CandidateMemberSignal[];
}

@Schema({ _id: false })
export class RoomProgress {
  @Prop({ default: '시작 전' })
  label: string;

  @Prop({ default: 0 })
  currentStep: number;

  @Prop({ default: 0 })
  percent: number;
}

@Schema({ _id: false })
export class ScheduleTicket {
  @Prop({ required: true })
  id: string;

  /** Public path, e.g. /uploads/tickets/{roomId}/{file} */
  @Prop({ required: true })
  imageUrl: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop()
  note?: string;

  @Prop()
  originalName?: string;

  @Prop()
  mimeType?: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

/** 사용자가 확인한 구조화 예약 (OCR 결과는 FE, 확인분만 공유) */
@Schema({ _id: false })
export class ConfirmedReservation {
  @Prop({ required: true })
  id: string;

  @Prop({
    enum: ['confirmed', 'unconfirmed', 'cancelled'],
    default: 'unconfirmed',
  })
  status: 'confirmed' | 'unconfirmed' | 'cancelled';

  /** YYYY-MM-DD — 없으면 미확인 */
  @Prop()
  date?: string;

  @Prop()
  startTime?: string;

  @Prop()
  endTime?: string;

  @Prop()
  timeWindowStart?: string;

  @Prop()
  timeWindowEnd?: string;

  @Prop()
  timezone?: string;

  @Prop({ type: Types.ObjectId, ref: 'Place' })
  placeId?: Types.ObjectId;

  @Prop()
  externalId?: string;

  @Prop()
  confirmationCode?: string;

  @Prop()
  note?: string;

  @Prop({ type: [String], default: [] })
  documentTicketIds: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  confirmedBy?: Types.ObjectId;

  @Prop()
  confirmedAt?: Date;

  @Prop({ default: 1 })
  revision: number;
}

@Schema({ _id: false })
export class ItineraryItem {
  @Prop({ required: true })
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Place' })
  placeId?: Types.ObjectId;

  @Prop({ required: true })
  placeName: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: '' })
  reason: string;

  @Prop({ enum: ['must', 'optional', 'skip'], default: 'optional' })
  priority: 'must' | 'optional' | 'skip';

  /** 여행 시작일 기준 1-based day (date에서 파생 가능) */
  @Prop({ default: 1 })
  day: number;

  /** 기준 날짜 YYYY-MM-DD (있으면 day는 이로부터 파생) */
  @Prop()
  date?: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ default: false })
  locked: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lockedBy?: Types.ObjectId;

  @Prop()
  lockedAt?: Date;

  @Prop({ type: [ScheduleTicket], default: [] })
  tickets: ScheduleTicket[];

  @Prop({ type: ConfirmedReservation })
  reservation?: ConfirmedReservation;
}

@Schema({ _id: false })
export class ScheduleDay {
  @Prop({ required: true })
  day: number;

  @Prop({ type: [ItineraryItem], default: [] })
  items: ItineraryItem[];
}

@Schema({ _id: false })
export class RoomSchedule {
  @Prop({ type: [ScheduleDay], default: [] })
  days: ScheduleDay[];
}

@Schema({ timestamps: true, collection: 'travel_rooms' })
export class TravelRoom {
  @Prop({ default: '새 여행방' })
  title: string;

  @Prop({ type: RoomDestination })
  destination?: RoomDestination;

  /** IANA timezone, e.g. Asia/Seoul */
  @Prop({ default: 'Asia/Seoul' })
  timezone: string;

  @Prop({ type: PlaceAnchor })
  lodging?: PlaceAnchor;

  @Prop({ type: PlaceAnchor })
  returnPoint?: PlaceAnchor;

  /** car | transit | walk | mixed */
  @Prop({ type: VersionedValue })
  transportMode?: VersionedValue;

  /** HH:mm 복귀 마감 */
  @Prop({ type: VersionedValue })
  returnDeadline?: VersionedValue;

  @Prop({ type: VersionedValue })
  travelBufferMinutes?: VersionedValue;

  @Prop({ type: VersionedValue })
  prepBufferMinutes?: VersionedValue;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ enum: ['ongoing', 'completed'], default: 'ongoing' })
  status: 'ongoing' | 'completed';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: [RoomMember], default: [] })
  members: RoomMember[];

  @Prop({ required: true, unique: true })
  inviteCode: string;

  @Prop()
  inviteLink?: string;

  @Prop({ type: RoomProgress, default: () => ({}) })
  progress: RoomProgress;

  @Prop({ type: [CandidatePlace], default: [] })
  candidatePlaces: CandidatePlace[];

  @Prop({ type: RoomSchedule, default: () => ({ days: [] }) })
  schedule: RoomSchedule;

  @Prop({ type: String, enum: ['jType', 'pType'], default: null })
  scheduleStyle?: 'jType' | 'pType' | null;

  @Prop()
  selectedCourseId?: string;

  /** optimistic concurrency for schedule mutations */
  @Prop({ default: 0 })
  scheduleVersion: number;

  /** bumps when candidates/members preference facts change — analysis stale check */
  @Prop({ default: 0 })
  factsVersion: number;

  /** Bounded receipts make standalone-Mongo document fallbacks idempotent. */
  @Prop({ type: [Object], default: [] })
  documentMutationReceipts: Array<{
    id: string;
    kind: 'upload' | 'delete';
    appliedAt: Date;
  }>;

  /** last clientMutationId for idempotent schedule retries */
  @Prop()
  lastScheduleMutationId?: string;
}

export const TravelRoomSchema = SchemaFactory.createForClass(TravelRoom);
TravelRoomSchema.index({ 'members.userId': 1, status: 1 });

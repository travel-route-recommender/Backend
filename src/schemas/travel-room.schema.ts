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

  @Prop({ default: 1 })
  day: number;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
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
}

export const TravelRoomSchema = SchemaFactory.createForClass(TravelRoom);
TravelRoomSchema.index({ 'members.userId': 1, status: 1 });
TravelRoomSchema.index({ inviteCode: 1 });

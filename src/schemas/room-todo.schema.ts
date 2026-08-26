import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomTodoDocument = HydratedDocument<RoomTodo>;

@Schema({ _id: false })
export class TodoChecklistItem {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: false })
  done: boolean;

  @Prop()
  doneAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  doneBy?: Types.ObjectId;
}

@Schema({ _id: false })
export class TodoLink {
  @Prop({
    enum: ['scheduleItem', 'reservation', 'ticket', 'document'],
    required: true,
  })
  type: 'scheduleItem' | 'reservation' | 'ticket' | 'document';

  @Prop({ required: true })
  targetId: string;

  /** optional schedule item id when linking reservation/ticket */
  @Prop()
  scheduleItemId?: string;
}

@Schema({ _id: false })
export class TodoSource {
  @Prop({
    enum: ['manual', 'duriAnalysis', 'ocrConfirm', 'scheduleChange'],
    default: 'manual',
  })
  kind: 'manual' | 'duriAnalysis' | 'ocrConfirm' | 'scheduleChange';

  /** stable dedupe key: room + cause + base revision scope */
  @Prop()
  dedupeKey?: string;

  @Prop()
  cause?: string;

  @Prop()
  baseRevision?: string;

  @Prop({ default: false })
  userEdited: boolean;

  /** user archived/deleted auto todo — block immediate recreate */
  @Prop({ default: false })
  suppressed: boolean;
}

@Schema({ timestamps: true, collection: 'room_todos' })
export class RoomTodo {
  @Prop({ type: Types.ObjectId, ref: 'TravelRoom', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({
    enum: ['open', 'in_progress', 'done', 'cancelled'],
    default: 'open',
  })
  status: 'open' | 'in_progress' | 'done' | 'cancelled';

  @Prop({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  /** YYYY-MM-DD — date-only deadline */
  @Prop()
  dueDate?: string;

  /** HH:mm — if set with dueDate, deadline includes time */
  @Prop()
  dueTime?: string;

  @Prop({ default: 'Asia/Seoul' })
  timezone: string;

  @Prop()
  remindAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assigneeId?: Types.ObjectId;

  @Prop({ type: [TodoChecklistItem], default: [] })
  checklist: TodoChecklistItem[];

  @Prop({ type: [TodoLink], default: [] })
  links: TodoLink[];

  @Prop({ type: TodoSource, default: () => ({ kind: 'manual', userEdited: false }) })
  source: TodoSource;

  @Prop({ default: false })
  archived: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  completedBy?: Types.ObjectId;

  /** optimistic concurrency per todo item */
  @Prop({ default: 1 })
  revision: number;

  @Prop()
  lastMutationId?: string;
}

export const RoomTodoSchema = SchemaFactory.createForClass(RoomTodo);
RoomTodoSchema.index({ roomId: 1, status: 1, archived: 1 });
RoomTodoSchema.index({ roomId: 1, assigneeId: 1 });
RoomTodoSchema.index(
  { roomId: 1, 'source.dedupeKey': 1 },
  { unique: true, partialFilterExpression: { 'source.dedupeKey': { $type: 'string' } } },
);

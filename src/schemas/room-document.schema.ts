import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomDocumentDoc = HydratedDocument<RoomDocumentFile>;

@Schema({ timestamps: true, collection: 'room_documents' })
export class RoomDocumentFile {
  @Prop({
    type: Types.ObjectId,
    ref: 'TravelRoom',
    required: true,
    index: true,
  })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  fileUrl: string;

  @Prop()
  originalName?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  size?: number;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  /** Standalone-development fallback marker; never expose before version commit. */
  @Prop()
  creatingAt?: Date;

  /** Deletion tombstone: blocks new reservation links while cleanup runs. */
  @Prop()
  deletingAt?: Date;

  /** Short lease used while a TODO link is being created or replaced. */
  @Prop()
  linkMutationToken?: string;

  @Prop()
  linkMutationExpiresAt?: Date;
}

export const RoomDocumentFileSchema =
  SchemaFactory.createForClass(RoomDocumentFile);
RoomDocumentFileSchema.index({ roomId: 1, createdAt: -1 });

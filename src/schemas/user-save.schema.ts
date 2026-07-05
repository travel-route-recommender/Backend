import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserSaveDocument = HydratedDocument<UserSave>;

@Schema({ timestamps: { createdAt: 'savedAt', updatedAt: false }, collection: 'user_saves' })
export class UserSave {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Place', required: true })
  placeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TravelRoom' })
  roomId?: Types.ObjectId;
}

export const UserSaveSchema = SchemaFactory.createForClass(UserSave);
UserSaveSchema.index({ userId: 1, placeId: 1, roomId: 1 }, { unique: true });

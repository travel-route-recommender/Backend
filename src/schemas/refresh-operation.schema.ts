import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshOperationDocument = HydratedDocument<RefreshOperation>;

@Schema({ timestamps: true, collection: 'refresh_operations' })
export class RefreshOperation {
  @Prop({ required: true })
  operationIdHash: string;

  @Prop({ required: true })
  requestTokenHash: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'AuthSession',
    required: true,
    index: true,
  })
  sessionId: Types.ObjectId;

  @Prop({ enum: ['completed'], default: 'completed' })
  status: 'completed';

  @Prop({ required: true, select: false })
  encryptedResponse: string;

  @Prop({ required: true })
  retryUntil: Date;

  @Prop({ required: true })
  purgeAt: Date;
}

export const RefreshOperationSchema =
  SchemaFactory.createForClass(RefreshOperation);
RefreshOperationSchema.index(
  { requestTokenHash: 1, operationIdHash: 1 },
  { unique: true },
);
RefreshOperationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

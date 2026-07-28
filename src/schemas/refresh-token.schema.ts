import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export type RefreshTokenStatus = 'active' | 'used' | 'revoked';

@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshToken {
  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'AuthSession',
    required: true,
    index: true,
  })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  familyId: string;

  @Prop({ required: true, min: 0 })
  generation: number;

  @Prop({ enum: ['active', 'used', 'revoked'], default: 'active' })
  status: RefreshTokenStatus;

  @Prop()
  usedAt?: Date;

  @Prop()
  usedByOperationIdHash?: string;

  @Prop()
  replacedByTokenHash?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true })
  purgeAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
RefreshTokenSchema.index({ familyId: 1, status: 1 });
RefreshTokenSchema.index({ sessionId: 1, generation: -1 });
RefreshTokenSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

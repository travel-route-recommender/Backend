import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuthSessionDocument = HydratedDocument<AuthSession>;
export type SessionStatus = 'active' | 'revoked' | 'compromised';
export type ClientPlatform = 'android' | 'ios' | 'web' | 'unknown';

@Schema({ timestamps: true, collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenFamilyId: string;

  @Prop({ required: true, index: true })
  installationIdHash: string;

  @Prop({ enum: ['android', 'ios', 'web', 'unknown'], default: 'unknown' })
  platform: ClientPlatform;

  @Prop()
  deviceName?: string;

  @Prop()
  appVersion?: string;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ enum: ['active', 'revoked', 'compromised'], default: 'active' })
  status: SessionStatus;

  @Prop({ required: true })
  idleExpiresAt: Date;

  @Prop({ required: true })
  absoluteExpiresAt: Date;

  @Prop({ required: true })
  purgeAt: Date;

  @Prop({ default: () => new Date() })
  lastSeenAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokeReason?: string;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ userId: 1, status: 1, lastSeenAt: -1 });
AuthSessionSchema.index({ absoluteExpiresAt: 1 });
AuthSessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

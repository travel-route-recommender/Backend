import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuthIdentityDocument = HydratedDocument<AuthIdentity>;
export type AuthProvider = 'password' | 'google' | 'kakao';

@Schema({ timestamps: true, collection: 'auth_identities' })
export class AuthIdentity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['password', 'google', 'kakao'], required: true })
  provider: AuthProvider;

  @Prop({ required: true, trim: true })
  issuer: string;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ lowercase: true, trim: true })
  emailNormalized?: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ select: false })
  passwordHash?: string;

  @Prop()
  lastAuthenticatedAt?: Date;
}

export const AuthIdentitySchema = SchemaFactory.createForClass(AuthIdentity);
AuthIdentitySchema.index(
  { provider: 1, issuer: 1, subject: 1 },
  { unique: true },
);
AuthIdentitySchema.index({ userId: 1, provider: 1 });
AuthIdentitySchema.index({ emailNormalized: 1, provider: 1 }, { sparse: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class RefreshReceipt {
  @Prop({ required: true })
  operationId: string;

  @Prop({ required: true })
  requestTokenHash: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  expiresAt: Date;
}

@Schema({ _id: false })
export class TravelType {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: '' })
  warning: string;

  @Prop({ default: '✈️' })
  emoji: string;
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop()
  passwordHash?: string;

  @Prop()
  oauthProvider?: string;

  @Prop()
  oauthId?: string;

  @Prop({ required: true, trim: true })
  nickname: string;

  @Prop()
  profileImageUrl?: string;

  @Prop({ type: TravelType })
  travelType?: TravelType;

  /** 최신 테스트 preference 캐시 (이동·숙소·예산 등) */
  @Prop({ type: Object })
  quizPreferences?: Record<string, unknown>;

  @Prop({ type: Object })
  personalityAxes?: {
    scheduleDensity: number;
    landmarkNecessity: number;
    localInterest: number;
    challenging: number;
  };

  @Prop()
  hasLicense?: boolean;

  @Prop()
  hasCar?: boolean;

  /** STAIRS | STEEP_SLOPE | LONG_WALK */
  @Prop({ type: [String], default: [] })
  mobilityConstraints: string[];

  @Prop()
  birthYear?: number;

  @Prop({ type: [String], default: [] })
  interestTags: string[];

  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ default: false })
  isGuest: boolean;

  @Prop({ type: [String], default: [] })
  refreshTokens: string[];

  /**
   * A short, bounded replay receipt for a single refresh operation. This lets
   * a client recover the exact response after a lost connection without
   * leaving the consumed refresh token generally reusable.
   */
  @Prop({ type: [RefreshReceipt], default: [] })
  refreshReceipts: RefreshReceipt[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index(
  { oauthProvider: 1, oauthId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      oauthProvider: { $type: 'string' },
      oauthId: { $type: 'string' },
    },
  },
);

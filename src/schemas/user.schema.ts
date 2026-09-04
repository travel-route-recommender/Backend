import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

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
  @Prop({ sparse: true, lowercase: true, trim: true })
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
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ oauthProvider: 1, oauthId: 1 }, { sparse: true });

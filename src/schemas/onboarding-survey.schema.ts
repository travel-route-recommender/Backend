import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OnboardingSurveyDocument = HydratedDocument<OnboardingSurvey>;

@Schema({ timestamps: true, collection: 'onboarding_surveys' })
export class OnboardingSurvey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  /** 레거시 자유 형식 */
  @Prop({ type: Object, default: {} })
  answers: Record<string, unknown>;

  @Prop()
  hasLicense?: boolean;

  @Prop()
  hasCar?: boolean;

  /** STAIRS | STEEP_SLOPE | LONG_WALK */
  @Prop({ type: [String], default: [] })
  mobilityConstraints: string[];

  @Prop()
  birthYear?: number;

  @Prop()
  age?: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  completedAt?: Date;
}

export const OnboardingSurveySchema =
  SchemaFactory.createForClass(OnboardingSurvey);

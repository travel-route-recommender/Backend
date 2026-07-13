import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OnboardingSurveyDocument = HydratedDocument<OnboardingSurvey>;

@Schema({ timestamps: true, collection: 'onboarding_surveys' })
export class OnboardingSurvey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  answers: Record<string, string>;

  @Prop()
  completedAt?: Date;
}

export const OnboardingSurveySchema =
  SchemaFactory.createForClass(OnboardingSurvey);

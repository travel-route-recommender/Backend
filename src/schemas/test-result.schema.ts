import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TravelType } from './user.schema';

export type TestResultDocument = HydratedDocument<TestResult>;

@Schema({ timestamps: true, collection: 'test_results' })
export class TestResult {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  answers: Record<string, string>;

  @Prop({ type: TravelType, required: true })
  travelType: TravelType;

  @Prop({ default: true })
  isLatest: boolean;
}

export const TestResultSchema = SchemaFactory.createForClass(TestResult);
TestResultSchema.index({ userId: 1, isLatest: 1 });
TestResultSchema.index({ userId: 1, createdAt: -1 });

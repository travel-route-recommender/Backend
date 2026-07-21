import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TravelType } from './user.schema';

export type TestResultDocument = HydratedDocument<TestResult>;

@Schema({ timestamps: true, collection: 'test_results' })
export class TestResult {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /** in_progress | completed */
  @Prop({ default: 'in_progress' })
  status: 'in_progress' | 'completed';

  /** 세션 중 누적 응답 */
  @Prop({ type: Object, default: {} })
  responses: Record<string, unknown>;

  /** 레거시 8문항 답변 (호환용) */
  @Prop({ type: Object })
  answers?: Record<string, string>;

  @Prop({ type: Object })
  preferences?: Record<string, unknown>;

  @Prop({ type: Object })
  axes?: {
    scheduleDensity: number;
    landmarkNecessity: number;
    localInterest: number;
    challenging: number;
  };

  @Prop({ type: TravelType })
  travelType?: TravelType;

  @Prop({ default: true })
  isLatest: boolean;

  /** 가장 최근 완료 결과 여부 (재테스트 중단 시에도 유지) */
  @Prop({ default: false })
  isLatestCompleted: boolean;

  @Prop()
  completedAt?: Date;
}

export const TestResultSchema = SchemaFactory.createForClass(TestResult);
TestResultSchema.index({ userId: 1, isLatest: 1 });
TestResultSchema.index({ userId: 1, isLatestCompleted: 1 });
TestResultSchema.index({ userId: 1, createdAt: -1 });
TestResultSchema.index({ userId: 1, status: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnalysisReportDocument = HydratedDocument<AnalysisReport>;

@Schema({ _id: false })
export class RouteAnalysis {
  @Prop({ default: false })
  available: boolean;

  @Prop()
  reason?: string;

  /** 총 이동 거리(km) */
  @Prop({ default: 0 })
  totalDistance: number;

  /** 총 이동 시간(초). Kakao Mobility 기준 */
  @Prop({ default: 0 })
  totalDurationSeconds: number;

  @Prop({ type: [Object], default: [] })
  segments: Record<string, unknown>[];

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ default: 0 })
  knownSegmentCount: number;

  @Prop({ default: 0 })
  unknownSegmentCount: number;
}

@Schema({ _id: false })
export class BudgetAnalysis {
  @Prop({ default: false })
  available: boolean;

  @Prop({ type: Number, default: null })
  estimated?: number | null;

  @Prop()
  reason?: string;

  @Prop()
  limit?: number;

  @Prop({ type: [Object], default: [] })
  breakdown: Record<string, unknown>[];
}

@Schema({ _id: false })
export class DensityDayAnalysis {
  @Prop()
  day: number;

  @Prop()
  score: number;

  @Prop()
  message: string;

  @Prop({ default: 0 })
  itemCount: number;

  @Prop({ default: 0 })
  occupiedMinutes: number;

  @Prop({ default: 0 })
  freeMinutesWithinSpan: number;

  @Prop({ default: 0 })
  spanMinutes: number;
}

@Schema({ _id: false })
export class DensityAnalysis {
  @Prop({ default: 'union_occupied_minutes_over_calendar_day' })
  method: string;

  @Prop({ default: 24 * 60 })
  scoreBasisMinutes: number;

  @Prop({ type: [DensityDayAnalysis], default: [] })
  byDay: DensityDayAnalysis[];
}

@Schema({ _id: false })
export class PreferenceReflection {
  @Prop({ default: false })
  available: boolean;

  @Prop({ type: Number, default: null })
  score?: number | null;

  @Prop()
  reason?: string;

  @Prop({ default: 0 })
  memberCount: number;

  @Prop({ default: 0 })
  representedMemberCount: number;

  @Prop({ type: [String], default: [] })
  missingMemberIds: string[];

  @Prop({ type: Number, default: 0 })
  coverageRatio: number;

  @Prop({ enum: ['none', 'partial', 'complete'], default: 'none' })
  confidence: 'none' | 'partial' | 'complete';

  @Prop({ type: [Object], default: [] })
  details: Record<string, unknown>[];
}

@Schema({ _id: false })
export class ConflictAnalysis {
  @Prop({ type: [Object], default: [] })
  overlaps: Record<string, unknown>[];

  @Prop({ type: [Object], default: [] })
  closedVenues: Record<string, unknown>[];

  @Prop({ default: false })
  operatingHoursAvailable: boolean;

  @Prop()
  operatingHoursReason?: string;
}

@Schema({ _id: false })
export class DuriSuggestion {
  @Prop()
  type: string;

  @Prop()
  message: string;

  @Prop({ type: Object })
  actionPayload?: Record<string, unknown>;
}

@Schema({ timestamps: true, collection: 'analysis_reports' })
export class AnalysisReport {
  @Prop({ type: Types.ObjectId, ref: 'TravelRoom', required: true })
  roomId: Types.ObjectId;

  @Prop({ default: 0 })
  scheduleVersion: number;

  @Prop({ default: 0 })
  factsVersion: number;

  @Prop({ default: 'evidence-v2' })
  analysisVersion: string;

  @Prop({ type: RouteAnalysis, default: () => ({}) })
  routeAnalysis: RouteAnalysis;

  @Prop({ type: BudgetAnalysis, default: () => ({}) })
  budgetAnalysis: BudgetAnalysis;

  @Prop({ type: DensityAnalysis, default: () => ({ byDay: [] }) })
  densityAnalysis: DensityAnalysis;

  @Prop({ type: PreferenceReflection, default: () => ({}) })
  preferenceReflection: PreferenceReflection;

  @Prop({ type: ConflictAnalysis, default: () => ({}) })
  conflictAnalysis: ConflictAnalysis;

  @Prop({ type: [DuriSuggestion], default: [] })
  suggestions: DuriSuggestion[];
}

export const AnalysisReportSchema =
  SchemaFactory.createForClass(AnalysisReport);
AnalysisReportSchema.index({ roomId: 1, createdAt: -1 });
AnalysisReportSchema.index({
  roomId: 1,
  scheduleVersion: 1,
  factsVersion: 1,
  analysisVersion: 1,
});

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnalysisReportDocument = HydratedDocument<AnalysisReport>;

@Schema({ _id: false })
export class RouteAnalysis {
  @Prop({ default: 0 })
  totalDistance: number;

  @Prop({ type: [Object], default: [] })
  segments: Record<string, unknown>[];

  @Prop({ type: [String], default: [] })
  warnings: string[];
}

@Schema({ _id: false })
export class BudgetAnalysis {
  @Prop({ default: 0 })
  estimated: number;

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
}

@Schema({ _id: false })
export class DensityAnalysis {
  @Prop({ type: [DensityDayAnalysis], default: [] })
  byDay: DensityDayAnalysis[];
}

@Schema({ _id: false })
export class PreferenceReflection {
  @Prop({ default: 0 })
  score: number;

  @Prop({ type: [Object], default: [] })
  details: Record<string, unknown>[];
}

@Schema({ _id: false })
export class ConflictAnalysis {
  @Prop({ type: [Object], default: [] })
  overlaps: Record<string, unknown>[];

  @Prop({ type: [Object], default: [] })
  closedVenues: Record<string, unknown>[];
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

  @Prop({ type: RouteAnalysis, default: () => ({}) })
  routeAnalysis: RouteAnalysis;

  @Prop({ type: BudgetAnalysis, default: () => ({}) })
  budgetAnalysis: BudgetAnalysis;

  @Prop({ type: DensityAnalysis, default: () => ({ days: [] }) })
  densityAnalysis: DensityAnalysis;

  @Prop({ type: PreferenceReflection, default: () => ({}) })
  preferenceReflection: PreferenceReflection;

  @Prop({ type: ConflictAnalysis, default: () => ({}) })
  conflictAnalysis: ConflictAnalysis;

  @Prop({ type: [DuriSuggestion], default: [] })
  suggestions: DuriSuggestion[];
}

export const AnalysisReportSchema = SchemaFactory.createForClass(AnalysisReport);
AnalysisReportSchema.index({ roomId: 1, createdAt: -1 });

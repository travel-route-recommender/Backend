import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DEFAULT_PLACE_POPULARITY_STATS } from '../places/place-popularity';
import type { PlacePopularityStats } from '../places/place-popularity';

export type PlaceDocument = HydratedDocument<Place>;

@Schema({ timestamps: true, collection: 'places' })
export class Place {
  @Prop({ sparse: true })
  externalId?: string;

  @Prop({ enum: ['kakao', 'manual', 'tour'], default: 'manual' })
  source: 'kakao' | 'manual' | 'tour';

  @Prop()
  contentTypeId?: number;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  address: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop()
  areaCode?: string;

  @Prop()
  sigunguCode?: string;

  @Prop()
  lclsSystm1?: string;

  @Prop()
  lclsSystm1Name?: string;

  @Prop()
  lclsSystm2?: string;

  @Prop()
  lclsSystm2Name?: string;

  @Prop()
  lclsSystm3?: string;

  @Prop()
  lclsSystm3Name?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  category?: string;

  @Prop()
  avgCost?: number;

  @Prop()
  openingHours?: string;

  @Prop({ default: 0 })
  popularityScore: number;

  @Prop({
    type: {
      searchCount: { type: Number, default: 0 },
      detailViewCount: { type: Number, default: 0 },
      saveCount: { type: Number, default: 0 },
      candidateAddCount: { type: Number, default: 0 },
    },
    default: () => ({ ...DEFAULT_PLACE_POPULARITY_STATS }),
  })
  stats: PlacePopularityStats;

  @Prop()
  popularityUpdatedAt?: Date;

  @Prop()
  phone?: string;

  @Prop()
  placeUrl?: string;
}

export const PlaceSchema = SchemaFactory.createForClass(Place);
PlaceSchema.index({ externalId: 1, source: 1 }, { sparse: true });
PlaceSchema.index({ name: 'text', address: 'text' });
PlaceSchema.index({ tags: 1 });
PlaceSchema.index({ category: 1 });
PlaceSchema.index({ popularityScore: -1, _id: 1 });
PlaceSchema.index({ source: 1, areaCode: 1, sigunguCode: 1, contentTypeId: 1 });

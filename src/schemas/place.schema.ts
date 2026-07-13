import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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

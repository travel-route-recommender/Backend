import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from '../schemas/place.schema';

@Injectable()
export class DestinationsService {
  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
  ) {}

  async getPopular() {
    return this.placeModel
      .find()
      .sort({ popularityScore: -1 })
      .limit(10)
      .select('name address lat lng tags category popularityScore images');
  }
}

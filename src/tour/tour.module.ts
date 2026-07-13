import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Place, PlaceSchema } from '../schemas/place.schema';
import { TourApiClient } from './tour-api.client';
import { TourController } from './tour.controller';
import { TourService } from './tour.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Place.name, schema: PlaceSchema }]),
  ],
  controllers: [TourController],
  providers: [TourApiClient, TourService],
  exports: [TourService],
})
export class TourModule {}

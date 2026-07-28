import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { CacheModule } from './common/cache/cache.module';
import { Place } from './schemas/place.schema';
import { TourApiClient } from './tour/tour-api.client';
import { TourController } from './tour/tour.controller';
import { TourService } from './tour/tour.service';

type TourDevPlaceUpdate = {
  $set?: {
    externalId?: unknown;
  };
};

const tourDevPlaceModel = {
  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: TourDevPlaceUpdate,
  ) {
    const externalId = update.$set?.externalId ?? filter.externalId ?? 'dev';
    return { _id: `tour-dev-${String(externalId)}` };
  },
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CacheModule],
  controllers: [TourController],
  providers: [
    TourApiClient,
    TourService,
    { provide: getModelToken(Place.name), useValue: tourDevPlaceModel },
  ],
})
export class TourDevModule {}

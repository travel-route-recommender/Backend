import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Place, PlaceSchema } from '../schemas/place.schema';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Place.name, schema: PlaceSchema }]),
  ],
  providers: [PlacesService],
  controllers: [PlacesController],
  exports: [PlacesService],
})
export class PlacesModule implements OnModuleInit {
  constructor(private readonly placesService: PlacesService) {}

  async onModuleInit() {
    try {
      await this.placesService.seedPopularPlaces();
    } catch (error) {
      console.warn('Place seed skipped:', error);
    }
  }
}

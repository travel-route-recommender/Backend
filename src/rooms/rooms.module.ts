import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Place, PlaceSchema } from '../schemas/place.schema';
import {
  AnalysisReport,
  AnalysisReportSchema,
} from '../schemas/analysis-report.schema';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { InvitesController } from './invites.controller';
import { DuriService } from './duri.service';
import { DuriController } from './duri.controller';
import { TourModule } from '../tour/tour.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TravelRoom.name, schema: TravelRoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Place.name, schema: PlaceSchema },
      { name: AnalysisReport.name, schema: AnalysisReportSchema },
    ]),
    TourModule,
  ],
  providers: [RoomsService, DuriService],
  controllers: [RoomsController, InvitesController, DuriController],
  exports: [RoomsService],
})
export class RoomsModule {}

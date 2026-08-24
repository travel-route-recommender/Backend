import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Place, PlaceSchema } from '../schemas/place.schema';
import {
  AnalysisReport,
  AnalysisReportSchema,
} from '../schemas/analysis-report.schema';
import { RoomTodo, RoomTodoSchema } from '../schemas/room-todo.schema';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { InvitesController } from './invites.controller';
import { DuriService } from './duri.service';
import { DuriController } from './duri.controller';
import { RoomTodosService } from './room-todos.service';
import { RoomTodosController } from './room-todos.controller';
import { RoomDocumentsService } from './room-documents.service';
import { RoomDocumentsController } from './room-documents.controller';
import {
  RoomDocumentFile,
  RoomDocumentFileSchema,
} from '../schemas/room-document.schema';
import { TourModule } from '../tour/tour.module';
import { MobilityModule } from '../mobility/mobility.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TravelRoom.name, schema: TravelRoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Place.name, schema: PlaceSchema },
      { name: AnalysisReport.name, schema: AnalysisReportSchema },
      { name: RoomTodo.name, schema: RoomTodoSchema },
      { name: RoomDocumentFile.name, schema: RoomDocumentFileSchema },
    ]),
    TourModule,
    MobilityModule,
  ],
  providers: [
    RoomsService,
    DuriService,
    RoomTodosService,
    RoomDocumentsService,
  ],
  controllers: [
    RoomsController,
    InvitesController,
    DuriController,
    RoomTodosController,
    RoomDocumentsController,
  ],
  exports: [RoomsService, RoomTodosService, RoomDocumentsService],
})
export class RoomsModule {}
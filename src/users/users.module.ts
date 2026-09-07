import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserSavesController } from './user-saves.controller';
import { UserSavesService } from './user-saves.service';
import { UserSave, UserSaveSchema } from '../schemas/user-save.schema';
import { Place, PlaceSchema } from '../schemas/place.schema';
import {
  RoomDocumentFile,
  RoomDocumentFileSchema,
} from '../schemas/room-document.schema';
import {
  TestResult,
  TestResultSchema,
} from '../schemas/test-result.schema';
import {
  OnboardingSurvey,
  OnboardingSurveySchema,
} from '../schemas/onboarding-survey.schema';
import { AppleModule } from '../auth/apple.module';

@Module({
  imports: [
    AppleModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TravelRoom.name, schema: TravelRoomSchema },
      { name: UserSave.name, schema: UserSaveSchema },
      { name: Place.name, schema: PlaceSchema },
      { name: RoomDocumentFile.name, schema: RoomDocumentFileSchema },
      { name: TestResult.name, schema: TestResultSchema },
      { name: OnboardingSurvey.name, schema: OnboardingSurveySchema },
    ]),
  ],
  providers: [UsersService, UserSavesService],
  controllers: [UsersController, UserSavesController],
  exports: [UsersService, UserSavesService],
})
export class UsersModule {}

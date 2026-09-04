import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OnboardingSurvey,
  OnboardingSurveySchema,
} from '../schemas/onboarding-survey.schema';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { UsersModule } from '../users/users.module';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: OnboardingSurvey.name, schema: OnboardingSurveySchema },
      { name: TravelRoom.name, schema: TravelRoomSchema },
    ]),
  ],
  providers: [OnboardingService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}

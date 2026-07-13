import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OnboardingSurvey,
  OnboardingSurveySchema,
} from '../schemas/onboarding-survey.schema';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OnboardingSurvey.name, schema: OnboardingSurveySchema },
    ]),
  ],
  providers: [OnboardingService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}

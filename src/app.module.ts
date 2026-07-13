import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuizModule } from './quiz/quiz.module';
import { RoomsModule } from './rooms/rooms.module';
import { PlacesModule } from './places/places.module';
import { DestinationsModule } from './destinations/destinations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { TourModule } from './tour/tour.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/tourmate'),
      }),
    }),
    AuthModule,
    UsersModule,
    OnboardingModule,
    QuizModule,
    RoomsModule,
    PlacesModule,
    DestinationsModule,
    TourModule,
  ],
})
export class AppModule {}

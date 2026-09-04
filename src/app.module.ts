import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from './common/cache/cache.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuizModule } from './quiz/quiz.module';
import { RoomsModule } from './rooms/rooms.module';
import { PlacesModule } from './places/places.module';
import { DestinationsModule } from './destinations/destinations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { TourModule } from './tour/tour.module';
import { MobilityModule } from './mobility/mobility.module';
import { validateEnvironment } from './environment.validation';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppLinksController } from './common/app-links.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CacheModule,
    StorageModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/tourmate',
        ),
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
    MobilityModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
  controllers: [AppLinksController],
})
export class AppModule {}

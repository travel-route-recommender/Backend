import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { NotificationsModule } from './notifications/notifications.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('RATE_LIMIT_TTL_MS', 60_000),
          limit: config.get<number>('RATE_LIMIT_MAX', 120),
        },
      ],
    }),
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
    NotificationsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

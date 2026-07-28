import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { CacheModule } from './common/cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuizModule } from './quiz/quiz.module';
import { RoomsModule } from './rooms/rooms.module';
import { PlacesModule } from './places/places.module';
import { DestinationsModule } from './destinations/destinations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { TourModule } from './tour/tour.module';
import { validateEnvironment } from './config/env.validation';
import { configureDnsServers } from './config/dns';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CacheModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        configureDnsServers(config.get<string>('DNS_SERVERS'));
        return {
          uri: config.get<string>(
            'MONGODB_URI',
            'mongodb://localhost:27017/tourmate',
          ),
          lazyConnection: true,
          retryAttempts: 0,
          serverSelectionTimeoutMS: 3000,
          bufferCommands: false,
          connectionFactory: (connection: Connection) => {
            const warnMongoUnavailable = (error: unknown) => {
              const message =
                error instanceof Error ? error.message : String(error);
              console.warn(`MongoDB connection unavailable: ${message}`);
            };

            connection.on('error', warnMongoUnavailable);
            void connection.asPromise().catch(warnMongoUnavailable);

            return connection;
          },
        };
      },
    }),
    AuthModule,
    UsersModule,
    OnboardingModule,
    QuizModule,
    RoomsModule,
    PlacesModule,
    DestinationsModule,
    TourModule,
    HealthModule,
  ],
})
export class AppModule {}

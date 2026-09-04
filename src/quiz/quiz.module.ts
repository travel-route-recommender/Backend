import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { UsersModule } from '../users/users.module';
import { TestResult, TestResultSchema } from '../schemas/test-result.schema';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: TestResult.name, schema: TestResultSchema },
      { name: TravelRoom.name, schema: TravelRoomSchema },
    ]),
  ],
  providers: [QuizService],
  controllers: [QuizController],
  exports: [QuizService],
})
export class QuizModule {}

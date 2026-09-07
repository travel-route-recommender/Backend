import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AppleModule } from './apple.module';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from '../common/guards/jwt.strategy';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';

@Module({
  imports: [
    UsersModule,
    AppleModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: TravelRoom.name, schema: TravelRoomSchema },
    ]),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
